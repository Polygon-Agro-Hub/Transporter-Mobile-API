const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "") ||
        socket.handshake.query?.token;

      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_jwt_secret_key");
          socket.userId = decoded.id;
          socket.empId = decoded.empId;
          socket.user = decoded;
        } catch (jwtErr) {
          console.warn("[Socket] Token verification failed:", jwtErr.message);
        }
      }
      return next();
    } catch (err) {
      console.error("[Socket] Auth middleware error:", err);
      return next();
    }
  });

  io.on("connection", (socket) => {
    console.log(`🔌 [Socket] Client connected: ${socket.id}, userId: ${socket.userId || "anonymous"}, empId: ${socket.empId || "none"}`);

    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
      console.log(`👤 [Socket] Socket ${socket.id} joined room user_${socket.userId}`);
    }
    if (socket.empId) {
      socket.join(`user_${socket.empId}`);
      console.log(`👤 [Socket] Socket ${socket.id} joined room user_${socket.empId}`);
    }

    socket.on("register_user", async (data) => {
      let targetUserId = null;
      let targetEmpId = null;
      let token = null;

      if (typeof data === "object" && data !== null) {
        targetUserId = data.userId;
        targetEmpId = data.empId;
        token = data.token;
      } else {
        targetUserId = data;
      }

      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_jwt_secret_key");
          socket.userId = decoded.id;
          socket.empId = decoded.empId;
          socket.user = decoded;
        } catch (tokenErr) {
          console.warn("[Socket Security] Token verification failed on register_user:", tokenErr.message);
        }
      }

      if (socket.userId) {
        socket.join(`user_${socket.userId}`);
      }
      if (socket.empId) {
        socket.join(`user_${socket.empId}`);
      }
      if (targetUserId && (!socket.userId || String(socket.userId) === String(targetUserId))) {
        socket.join(`user_${targetUserId}`);
        console.log(`👤 [Socket] Socket ${socket.id} joined room user_${targetUserId}`);
      }
      if (targetEmpId && (!socket.empId || String(socket.empId).toUpperCase() === String(targetEmpId).toUpperCase())) {
        socket.join(`user_${targetEmpId}`);
        console.log(`👤 [Socket] Socket ${socket.id} joined room user_${targetEmpId}`);
      }

      // Proactive Security: Check if user is already Rejected or Not Approved and notify immediately
      try {
        const userAuthDao = require("../dao/userAuth-dao");
        const officerStatusCache = require("../services/officer-status-cache");
        const effectiveId = socket.userId || targetUserId;
        const effectiveEmpId = socket.empId || targetEmpId;

        if (effectiveId && officerStatusCache.isRejected(effectiveId)) {
          socket.emit("account_status_changed", {
            status: "Rejected",
            statusType: "rejected",
            message: "This Employee ID is rejected",
          });
          return;
        }

        const officer = await userAuthDao.getOfficerDetailsDao({
          id: effectiveId,
          empId: effectiveEmpId,
        });

        if (officer) {
          officerStatusCache.setOfficerStatus(officer.id, officer.status);
          if (officer.status === "Rejected" || officer.status === "Not Approved") {
            const payload = {
              status: officer.status,
              statusType: officer.status === "Rejected" ? "rejected" : "not_approved",
              message: `This Employee ID is ${officer.status.toLowerCase()}`,
            };
            socket.emit("account_status_changed", payload);
            console.log(`⛔ [Socket Security] Immediately notified rejected client ${socket.id}:`, payload);
          }
        }
      } catch (checkErr) {
        console.warn("[Socket Security] Error verifying user status on register_user:", checkErr.message);
      }
    });

    // Join room for a specific load code / transfer code
    socket.on("join_load", (data) => {
      const transferCode = typeof data === "object" ? data.transferCode || data.loadCode : data;
      if (transferCode) {
        socket.join(`load_${transferCode}`);
        console.log(`📦 [Socket] Socket ${socket.id} joined load room: load_${transferCode}`);
      }
    });

    // Leave room for a specific load code / transfer code
    socket.on("leave_load", (data) => {
      const transferCode = typeof data === "object" ? data.transferCode || data.loadCode : data;
      if (transferCode) {
        socket.leave(`load_${transferCode}`);
        console.log(`📦 [Socket] Socket ${socket.id} left load room: load_${transferCode}`);
      }
    });

    socket.on("send_test_load_delivered", (data) => {
      if (data && (data.transferCode || data.loadCode)) {
        const transferCode = data.transferCode || data.loadCode;
        emitLoadDelivered(transferCode, data);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`🔌 [Socket] Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

const emitLoadDelivered = (transferCode, payload = {}) => {
  if (!io) {
    console.warn("[Socket] IO not initialized, cannot emit load_delivered");
    return false;
  }

  const data = {
    transferCode,
    loadCode: transferCode,
    status: "delivered",
    deliveredAt: new Date().toISOString(),
    ...payload,
  };

  const loadRoom = `load_${transferCode}`;
  io.to(loadRoom).emit("load_delivered", data);
  console.log(`📢 [Socket] Emitted load_delivered to ${loadRoom}:`, transferCode);

  if (payload.driverId) {
    const userRoom = `user_${payload.driverId}`;
    io.to(userRoom).emit("load_delivered", data);
    console.log(`📢 [Socket] Emitted load_delivered to ${userRoom}:`, transferCode);
  }

  // Also broadcast to general listeners if needed
  io.emit("load_status_changed", data);

  return true;
};


/**
 * Emit driver account status change (e.g. Banned / Rejected / Not Approved).
 * Emits to user_${identifier} (accepts single userId/empId or array of identifiers).
 * Consolidates rooms so Socket.io delivers only 1 event to multi-room sockets and logs once.
 */
const emitUserStatusChanged = (userIdentifiers, statusData = {}) => {
  if (!io) {
    console.warn("[Socket] IO not initialized, cannot emit account_status_changed");
    return false;
  }

  const rawList = Array.isArray(userIdentifiers)
    ? [...userIdentifiers]
    : [userIdentifiers];

  if (statusData.userId) rawList.push(statusData.userId);
  if (statusData.empId) rawList.push(statusData.empId);

  const rooms = [
    ...new Set(
      rawList
        .filter(Boolean)
        .map((id) => (String(id).startsWith("user_") ? String(id) : `user_${id}`))
    ),
  ];

  if (rooms.length === 0) {
    console.warn("[Socket] No valid target rooms for account_status_changed");
    return false;
  }

  const payload = {
    status: statusData.status,
    statusType:
      statusData.statusType ||
      (statusData.status || "").toLowerCase().replace(/\s+/g, "_"),
    message: statusData.message || `Your account status has changed to ${statusData.status}.`,
    ...statusData,
  };

  io.to(rooms).emit("account_status_changed", payload);
  console.log(`📢 [Socket] Emitted account_status_changed to ${rooms.join(", ")}:`, payload);
  return true;
};

module.exports = {
  initSocket,
  getIO,
  emitLoadDelivered,
  emitUserStatusChanged,
};
