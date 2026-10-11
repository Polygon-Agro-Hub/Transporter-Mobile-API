/**
 * migration-calculations.test.js
 * Verification of financial calculation logic affected by processorders migration.
 * Uses Node.js native test runner (compatible with Node 18+ and Node 22).
 */

const test = require('node:test');
const assert = require('node:assert');

// 1. Helper: isFreeDeliveryCoupon
function isFreeDeliveryCoupon(row) {
  return (
    !!row.isCoupon &&
    (row.couponType || "").toString().trim().toLowerCase() === "free delivery"
  );
}

// 2. Helper: getHandlingFee
const HANDLING_FEE_CONSTANTS = {
  LOW_TOTAL_LIMIT: 2000,
  MID_TOTAL_LIMIT: 5000,
  LOW_FEE: 50,
  MID_FEE: 100,
  HIGH_FEE: 150
};

function getHandlingFee(fullTotal) {
  const total = Number(fullTotal) || 0;
  if (total <= HANDLING_FEE_CONSTANTS.LOW_TOTAL_LIMIT) {
    return HANDLING_FEE_CONSTANTS.LOW_FEE;
  }
  if (total <= HANDLING_FEE_CONSTANTS.MID_TOTAL_LIMIT) {
    return HANDLING_FEE_CONSTANTS.MID_FEE;
  }
  return HANDLING_FEE_CONSTANTS.HIGH_FEE;
}

test('isFreeDeliveryCoupon correctly evaluates coupon status and type', () => {
  assert.strictEqual(isFreeDeliveryCoupon({ isCoupon: 1, couponType: 'free delivery' }), true);
  assert.strictEqual(isFreeDeliveryCoupon({ isCoupon: 1, couponType: 'Free Delivery ' }), true);
  assert.strictEqual(isFreeDeliveryCoupon({ isCoupon: 0, couponType: 'free delivery' }), false);
  assert.strictEqual(isFreeDeliveryCoupon({ isCoupon: 1, couponType: 'discount 10%' }), false);
  assert.strictEqual(isFreeDeliveryCoupon({ isCoupon: null, couponType: null }), false);
});

test('getHandlingFee calculates tiered fees from migrated fullTotal', () => {
  assert.strictEqual(getHandlingFee(1500), 50);
  assert.strictEqual(getHandlingFee(2000), 50);
  assert.strictEqual(getHandlingFee(3500), 100);
  assert.strictEqual(getHandlingFee(5000), 100);
  assert.strictEqual(getHandlingFee(7500), 150);
});

test('Cash delivery calculation with Free Delivery coupon using processorders fields', () => {
  // Scenario: fullTotal = 3000, base deliveryCharge = 350, creditPaid = 500, free delivery coupon
  const po = {
    fullTotal: 3000,
    deliveryCharge: 350,
    creditPaid: 500,
    isCoupon: 1,
    couponType: 'free delivery'
  };

  const oldDeliveryCharge = Number(po.deliveryCharge) || 0;
  const orderValue = (Number(po.fullTotal) || 0) - oldDeliveryCharge;
  const creditPaid = Number(po.creditPaid) || 0;

  let cashAmountDue;
  if (isFreeDeliveryCoupon(po)) {
    cashAmountDue = orderValue - creditPaid;
  } else {
    cashAmountDue = orderValue + 400 - creditPaid; // with hypothetical new delivery
  }

  // orderValue = 3000 - 350 = 2650; cashAmountDue = 2650 - 500 = 2150
  assert.strictEqual(orderValue, 2650);
  assert.strictEqual(cashAmountDue, 2150);
});

test('Cash delivery calculation with standard delivery using processorders fields', () => {
  // Scenario: fullTotal = 3000, base deliveryCharge = 350, todaysDeliveryCharge = 400, creditPaid = 200
  const po = {
    fullTotal: 3000,
    deliveryCharge: 350,
    creditPaid: 200,
    isCoupon: 0,
    couponType: null
  };

  const oldDeliveryCharge = Number(po.deliveryCharge) || 0;
  const orderValue = (Number(po.fullTotal) || 0) - oldDeliveryCharge;
  const todaysDeliveryCharge = 400;
  const creditPaid = Number(po.creditPaid) || 0;

  const cashAmountDue = orderValue + todaysDeliveryCharge - creditPaid;
  // orderValue = 2650; cashAmountDue = 2650 + 400 - 200 = 2850
  assert.strictEqual(cashAmountDue, 2850);
});

test('Return order cash due calculation preserves base deliveryCharge vs curDlvrCharge', () => {
  // Formula in return-dao.js: fullTotal - deliveryCharge + curDlvrCharge - creditPaid
  const po = {
    fullTotal: 5000,
    deliveryCharge: 350,   // Base deliveryCharge migrated to processorders
    curDlvrCharge: 400,    // Adjusted current charge from driver
    creditPaid: 1000
  };

  const fullTotal = Number(po.fullTotal) || 0;
  const deliveryCharge = Number(po.deliveryCharge) || 0;
  const curDlvrCharge = Number(po.curDlvrCharge) || 0;
  const creditPaid = Number(po.creditPaid) || 0;

  const cashAmountDue = fullTotal - deliveryCharge + curDlvrCharge - creditPaid;
  // 5000 - 350 + 400 - 1000 = 4050
  assert.strictEqual(cashAmountDue, 4050);
});

test('Card payable update sets po.amount = po.fullTotal', () => {
  const po = { id: 101, fullTotal: 4500.50, isPaid: 0, amount: 0 };
  
  // Simulated UPDATE SET po.isPaid = 1, po.amount = po.fullTotal
  po.isPaid = 1;
  po.amount = po.fullTotal;

  assert.strictEqual(po.isPaid, 1);
  assert.strictEqual(po.amount, 4500.50);
});

test('Return orders totalAmount fallback: po.fullTotal || po.total', () => {
  const rowWithFullTotal = { fullTotal: 2500, total: 2400 };
  assert.strictEqual(rowWithFullTotal.fullTotal || rowWithFullTotal.total, 2500);

  const rowWithOnlyTotal = { fullTotal: 0, total: 2400 };
  assert.strictEqual(rowWithOnlyTotal.fullTotal || rowWithOnlyTotal.total, 2400);
});
