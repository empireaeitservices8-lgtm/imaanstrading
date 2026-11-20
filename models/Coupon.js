const { getPool } = require("../config/mysql");

const Coupon = {
  async findByCode(code) {
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) return null;
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT * FROM `coupons` WHERE UPPER(`code`) = ? LIMIT 1",
      [clean]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async findById(id) {
    if (!id) return null;
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT * FROM `coupons` WHERE `id` = ? LIMIT 1",
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async findAll() {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT * FROM `coupons` ORDER BY `is_active` DESC, `created_at` DESC"
    );
    return rows;
  },

  async findActive() {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT `id`, `code`, `description`, `discount_type`, `discount_value`, `min_order_value`, `max_discount`, `free_shipping`, `expires_at` FROM `coupons` WHERE `is_active` = 1 AND (`expires_at` IS NULL OR `expires_at` > NOW()) ORDER BY `discount_value` DESC"
    );
    return rows;
  },

  async validateForCart(code, { subtotal = 0, email = "", phone = "" }) {
    const cleanCode = String(code || "").trim().toUpperCase();
    if (!cleanCode) {
      return { valid: false, error: "Please enter a coupon code." };
    }

    const coupon = await this.findByCode(cleanCode);
    if (!coupon) {
      return { valid: false, error: `Coupon code "${cleanCode}" is invalid.` };
    }

    if (!coupon.is_active) {
      return { valid: false, error: `Coupon "${cleanCode}" is no longer active.` };
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return { valid: false, error: `Coupon "${cleanCode}" has expired.` };
    }

    const sub = Number(subtotal) || 0;
    const minVal = Number(coupon.min_order_value) || 0;
    if (sub < minVal) {
      return {
        valid: false,
        error: `Minimum order value of ₹${minVal.toFixed(0)} required for "${cleanCode}". (Cart: ₹${sub.toFixed(0)})`,
      };
    }

    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
      if (coupon.used_count >= coupon.usage_limit) {
        return { valid: false, error: `Coupon "${cleanCode}" has reached its maximum usage limit.` };
      }
    }

    // Check per-user limit
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPhone = String(phone || "").trim();
    if (cleanEmail || cleanPhone) {
      const pool = getPool();
      let query = "SELECT COUNT(*) as cnt FROM `coupon_usages` WHERE `coupon_id` = ? AND (";
      const params = [coupon.id];
      const conds = [];
      if (cleanEmail) {
        conds.push("`customer_email` = ?");
        params.push(cleanEmail);
      }
      if (cleanPhone) {
        conds.push("`customer_phone` = ?");
        params.push(cleanPhone);
      }
      query += conds.join(" OR ") + ")";

      const [usageRows] = await pool.query(query, params);
      const userUsed = Number(usageRows[0]?.cnt || 0);
      if (userUsed >= coupon.per_user_limit) {
        return {
          valid: false,
          error: `You have already used coupon "${cleanCode}" the maximum allowed times (${coupon.per_user_limit}).`,
        };
      }
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (coupon.discount_type === "percentage") {
      discountAmount = Math.round((sub * Number(coupon.discount_value)) / 100);
      if (coupon.max_discount && discountAmount > Number(coupon.max_discount)) {
        discountAmount = Number(coupon.max_discount);
      }
    } else {
      discountAmount = Number(coupon.discount_value);
    }

    // Discount cannot exceed subtotal
    discountAmount = Math.min(discountAmount, sub);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discount_type,
        discountValue: Number(coupon.discount_value),
        discountAmount,
        freeShipping: Boolean(coupon.free_shipping),
      },
    };
  },

  async recordUsage(connOrPool, couponId, orderId, { email = "", phone = "", discountAmount = 0 }) {
    if (!couponId) return;
    await connOrPool.query(
      "UPDATE `coupons` SET `used_count` = `used_count` + 1 WHERE `id` = ?",
      [couponId]
    );
    await connOrPool.query(
      "INSERT INTO `coupon_usages` (`coupon_id`, `order_id`, `customer_email`, `customer_phone`, `discount_amount`) VALUES (?, ?, ?, ?, ?)",
      [couponId, String(orderId), String(email).trim().toLowerCase(), String(phone).trim(), Number(discountAmount || 0)]
    );
  },

  async create(data) {
    const pool = getPool();
    const code = String(data.code || "").trim().toUpperCase();
    const rawMax = data.maxDiscount !== undefined
      ? data.maxDiscount
      : data.max_discount !== undefined
        ? data.max_discount
        : data.maxDiscountAmount;
    const maxDiscount = rawMax ? Number(rawMax) : null;

    let isActive = 1;
    if (data.isActive !== undefined) {
      isActive = (data.isActive === true || data.isActive === 1 || data.isActive === "1" || data.isActive === "active") ? 1 : 0;
    } else if (data.is_active !== undefined) {
      isActive = (data.is_active === true || data.is_active === 1 || data.is_active === "1" || data.is_active === "active") ? 1 : 0;
    } else if (data.status !== undefined) {
      isActive = (data.status === "active" || data.status === true || data.status === 1 || data.status === "1") ? 1 : 0;
    }

    let expiresAt = null;
    const rawExpires = data.expiresAt !== undefined ? data.expiresAt : data.expires_at;
    if (rawExpires) {
      const d = new Date(rawExpires);
      expiresAt = isNaN(d.getTime()) ? null : d;
    }

    const [res] = await pool.query(
      `INSERT INTO \`coupons\` (\`code\`, \`description\`, \`discount_type\`, \`discount_value\`, \`min_order_value\`, \`max_discount\`, \`free_shipping\`, \`usage_limit\`, \`per_user_limit\`, \`expires_at\`, \`is_active\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        String(data.description || "").trim(),
        data.discountType === "flat" ? "flat" : "percentage",
        Number(data.discountValue || 0),
        Number(data.minOrderValue || 0),
        maxDiscount,
        data.freeShipping ? 1 : 0,
        data.usageLimit ? Number(data.usageLimit) : null,
        Number(data.perUserLimit || 1),
        expiresAt,
        isActive,
      ]
    );
    return res.insertId;
  },

  async update(id, data) {
    const pool = getPool();
    const [rows] = await pool.query("SELECT * FROM `coupons` WHERE `id` = ? LIMIT 1", [id]);
    if (!rows || rows.length === 0) {
      const err = new Error(`Coupon with ID "${id}" not found.`);
      err.statusCode = 404;
      throw err;
    }
    const current = rows[0];

    const code = data.code !== undefined ? String(data.code).trim().toUpperCase() : current.code;
    const description = data.description !== undefined ? String(data.description || "").trim() : (current.description || "");
    const discountType = (data.discountType || data.discount_type || current.discount_type) === "flat" ? "flat" : "percentage";
    const rawDiscount = data.discountValue !== undefined ? data.discountValue : data.discount_value;
    const discountValue = rawDiscount !== undefined ? Number(rawDiscount) : Number(current.discount_value || 0);
    const rawMinOrder = data.minOrderValue !== undefined ? data.minOrderValue : data.min_order_value;
    const minOrderValue = rawMinOrder !== undefined ? Number(rawMinOrder) : Number(current.min_order_value || 0);
    
    const rawMax = data.maxDiscount !== undefined 
      ? data.maxDiscount 
      : data.max_discount !== undefined 
        ? data.max_discount 
        : data.maxDiscountAmount;
    const maxDiscount = rawMax !== undefined 
      ? (rawMax ? Number(rawMax) : null) 
      : current.max_discount;

    const rawShipping = data.freeShipping !== undefined ? data.freeShipping : data.free_shipping;
    const freeShipping = rawShipping !== undefined 
      ? (rawShipping ? 1 : 0) 
      : (current.free_shipping ? 1 : 0);

    const rawUsage = data.usageLimit !== undefined ? data.usageLimit : data.usage_limit;
    const usageLimit = rawUsage !== undefined 
      ? (rawUsage ? Number(rawUsage) : null) 
      : current.usage_limit;

    const rawPerUser = data.perUserLimit !== undefined ? data.perUserLimit : data.per_user_limit;
    const perUserLimit = rawPerUser !== undefined 
      ? Number(rawPerUser) 
      : Number(current.per_user_limit || 1);

    let expiresAt = current.expires_at;
    const rawExpires = data.expiresAt !== undefined ? data.expiresAt : data.expires_at;
    if (rawExpires !== undefined) {
      if (!rawExpires) {
        expiresAt = null;
      } else {
        const d = new Date(rawExpires);
        expiresAt = isNaN(d.getTime()) ? null : d;
      }
    }

    // Support boolean true/false, integer 1/0, string '1'/'0', or string 'active'/'inactive'/'disabled'
    let isActive = current.is_active ? 1 : 0;
    if (data.isActive !== undefined) {
      isActive = (data.isActive === true || data.isActive === 1 || data.isActive === "1" || data.isActive === "active") ? 1 : 0;
    } else if (data.is_active !== undefined) {
      isActive = (data.is_active === true || data.is_active === 1 || data.is_active === "1" || data.is_active === "active") ? 1 : 0;
    } else if (data.status !== undefined) {
      isActive = (data.status === "active" || data.status === true || data.status === 1 || data.status === "1") ? 1 : 0;
    }

    await pool.query(
      `UPDATE \`coupons\` SET
        \`code\` = ?,
        \`description\` = ?,
        \`discount_type\` = ?,
        \`discount_value\` = ?,
        \`min_order_value\` = ?,
        \`max_discount\` = ?,
        \`free_shipping\` = ?,
        \`usage_limit\` = ?,
        \`per_user_limit\` = ?,
        \`expires_at\` = ?,
        \`is_active\` = ?
       WHERE \`id\` = ?`,
      [
        code,
        description,
        discountType,
        discountValue,
        minOrderValue,
        maxDiscount,
        freeShipping,
        usageLimit,
        perUserLimit,
        expiresAt,
        isActive,
        id,
      ]
    );

    const [updatedRows] = await pool.query("SELECT * FROM `coupons` WHERE `id` = ? LIMIT 1", [id]);
    return updatedRows[0] || null;
  },

  async delete(id) {
    const pool = getPool();
    await pool.query("DELETE FROM `coupons` WHERE `id` = ?", [id]);
  },
};

module.exports = Coupon;

