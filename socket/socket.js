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
    console.log(`🔌 [Socket] Client connected: ${socket.id}, userId: ${socket.userId || "anonymous"}`);

    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
      console.log(`👤 [Socket] Socket ${socket.id} joined room user_${socket.userId}`);
    }

    socket.on("register_user", (data) => {
      let targetUserId = null;
      let token = null;

      if (typeof data === "object" && data !== null) {
        targetUserId = data.userId;
        token = data.token;
      } else {
        targetUserId = data;
      }

      if (!targetUserId) return;

      if (socket.userId) {
        if (String(socket.userId) === String(targetUserId)) {
          socket.join(`user_${targetUserId}`);
          console.log(`👤 [Socket] Verified socket ${socket.id} joined room user_${targetUserId}`);
        } else {
          console.warn(`⚠️ [Socket Security] Blocked room hijacking: socket ${socket.id} (user ${socket.userId}) attempted to join user_${targetUserId}`);
        }
        return;
      }

      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_jwt_secret_key");
          if (String(decoded.id) === String(targetUserId)) {
            socket.userId = decoded.id;
            socket.user = decoded;
            socket.join(`user_${targetUserId}`);
            console.log(`👤 [Socket] Socket ${socket.id} verified via payload token and joined room user_${targetUserId}`);
            return;
          } else {
            console.warn(`⚠️ [Socket Security] Token userId (${decoded.id}) does not match target (${targetUserId})`);
            return;
          }
        } catch (tokenErr) {
          console.warn("[Socket Security] Token verification failed on register_user:", tokenErr.message);
          return;
        }
      }

      console.warn(`⚠️ [Socket Security] Blocked unauthenticated register_user attempt for user_${targetUserId} from socket ${socket.id}`);
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

const emitNotificationToUser = (userId, notification) => {
  if (!io) {
    console.warn("[Socket] IO not initialized, cannot emit notification");
    return false;
  }

  const room = `user_${userId}`;
  io.to(room).emit("new_notification", notification);
  console.log(`📢 [Socket] Emitted new_notification to ${room}:`, notification?.title || notification?.id);
  return true;
};

module.exports = {
  initSocket,
  getIO,
  emitLoadDelivered,
  emitNotificationToUser,
};
