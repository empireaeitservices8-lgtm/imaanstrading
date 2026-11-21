const { getPool } = require("../config/mysql");

const Review = {
  async findByProductId(productId, { page = 1, limit = 10, approvedOnly = true } = {}) {
    const pool = getPool();
    const offset = Math.max(0, (Number(page) - 1) * Number(limit));

    const whereClause = approvedOnly ? "WHERE `product_id` = ? AND `is_approved` = 1" : "WHERE `product_id` = ?";
    const [rows] = await pool.query(
      `SELECT * FROM \`product_reviews\` ${whereClause} ORDER BY \`created_at\` DESC LIMIT ? OFFSET ?`,
      [Number(productId), Number(limit), offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM \`product_reviews\` ${whereClause}`,
      [Number(productId)]
    );

    // Calculate rating summary
    const [statsRows] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        AVG(rating) as avgRating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as star5,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as star4,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as star3,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as star2,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as star1
       FROM \`product_reviews\` WHERE \`product_id\` = ? AND \`is_approved\` = 1`,
      [Number(productId)]
    );

    const s = statsRows[0] || {};
    const totalCount = Number(s.total || 0);
    const avg = totalCount > 0 ? Number(Number(s.avgRating || 5).toFixed(1)) : 5.0;

    return {
      reviews: rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        customerName: r.customer_name,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        images: r.images ? (typeof r.images === "string" ? JSON.parse(r.images) : r.images) : [],
        isVerifiedPurchase: Boolean(r.is_verified_purchase),
        createdAt: r.created_at,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(countRows[0]?.total || 0),
      },
      summary: {
        averageRating: avg,
        totalReviews: totalCount,
        stars: {
          5: Number(s.star5 || 0),
          4: Number(s.star4 || 0),
          3: Number(s.star3 || 0),
          2: Number(s.star2 || 0),
          1: Number(s.star1 || 0),
        },
      },
    };
  },

  async isCustomerVerifiedPurchase(productId, email, phone) {
    if (!email && !phone) return false;
    const pool = getPool();
    let query = `
      SELECT o.id 
      FROM \`orders\` o
      JOIN \`order_items\` oi ON o.id = oi.order_ref_id
      WHERE (oi.product_id = ? OR oi.product_key = ?)
        AND o.status NOT IN ('cancelled')
        AND (1=0
    `;
    const params = [Number(productId), String(productId)];
    if (email) {
      query += " OR LOWER(o.customer_email) = ?";
      params.push(String(email).trim().toLowerCase());
    }
    if (phone) {
      query += " OR o.customer_phone = ?";
      params.push(String(phone).trim());
    }
    query += ") LIMIT 1";

    const [rows] = await pool.query(query, params);
    return rows.length > 0;
  },

  async create(data) {
    const pool = getPool();

    // Check verified purchase
    const isVerified = await this.isCustomerVerifiedPurchase(
      data.productId,
      data.customerEmail,
      data.customerPhone
    );

    const imagesJson = data.images && Array.isArray(data.images) ? JSON.stringify(data.images) : null;

    const [res] = await pool.query(
      `INSERT INTO \`product_reviews\`
        (\`product_id\`, \`user_id\`, \`order_id\`, \`customer_name\`, \`customer_email\`, \`rating\`, \`title\`, \`comment\`, \`images\`, \`is_verified_purchase\`, \`is_approved\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        Number(data.productId),
        data.userId || null,
        data.orderId || null,
        String(data.customerName || "Customer").trim(),
        String(data.customerEmail || "").trim().toLowerCase(),
        Math.max(1, Math.min(5, Number(data.rating || 5))),
        String(data.title || "").trim().slice(0, 255),
        String(data.comment || "").trim(),
        imagesJson,
        isVerified ? 1 : 0,
      ]
    );

    // Update parent product cached rating & review_count
    await this.syncProductRating(data.productId);

    return res.insertId;
  },

  async syncProductRating(productId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT COUNT(*) as cnt, AVG(rating) as avgRating FROM \`product_reviews\` WHERE \`product_id\` = ? AND \`is_approved\` = 1`,
      [Number(productId)]
    );
    const count = Number(rows[0]?.cnt || 0);
    const avg = count > 0 ? Number(Number(rows[0]?.avgRating || 4.6).toFixed(2)) : 4.6;

    await pool.query(
      "UPDATE `products` SET `rating` = ?, `review_count` = ? WHERE `id` = ?",
      [avg, count, Number(productId)]
    );
  },

  async findAllForAdmin({ page = 1, limit = 50 } = {}) {
    const pool = getPool();
    const offset = Math.max(0, (Number(page) - 1) * Number(limit));
    const [rows] = await pool.query(
      `SELECT r.*, p.name as product_name, p.slug as product_slug, p.image as product_image
       FROM \`product_reviews\` r
       LEFT JOIN \`products\` p ON r.product_id = p.id
       ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [Number(limit), offset]
    );

    const [cnt] = await pool.query("SELECT COUNT(*) as total FROM `product_reviews`");
    const reviews = rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name || "Product",
      productSlug: r.product_slug || "",
      productImage: r.product_image || "",
      customerName: r.customer_name || "",
      customerEmail: r.customer_email || "",
      userName: r.customer_name || "Customer",
      userEmail: r.customer_email || "",
      rating: Number(r.rating || 5),
      title: r.title || "",
      comment: r.comment || "",
      reviewText: r.comment || "",
      images: r.images ? (typeof r.images === "string" ? JSON.parse(r.images) : r.images) : [],
      isVerifiedPurchase: Boolean(r.is_verified_purchase),
      isVerifiedBuyer: Boolean(r.is_verified_purchase),
      isApproved: Boolean(r.is_approved),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      // Backward compatibility keys
      product_id: r.product_id,
      product_name: r.product_name || "Product",
      product_slug: r.product_slug || "",
      customer_name: r.customer_name || "",
      customer_email: r.customer_email || "",
      is_verified_purchase: Boolean(r.is_verified_purchase),
      is_approved: Boolean(r.is_approved),
      created_at: r.created_at,
    }));

    return {
      reviews,
      total: Number(cnt[0]?.total || 0),
    };
  },

  async updateApproval(id, isApproved) {
    const pool = getPool();
    const numId = Number(id);
    if (!numId || isNaN(numId)) {
      const err = new Error("Valid review ID is required.");
      err.statusCode = 400;
      throw err;
    }
    await pool.query("UPDATE `product_reviews` SET `is_approved` = ? WHERE `id` = ?", [
      isApproved ? 1 : 0,
      numId,
    ]);
    const [rows] = await pool.query("SELECT `product_id` FROM `product_reviews` WHERE `id` = ?", [
      numId,
    ]);
    if (rows[0]?.product_id) {
      await this.syncProductRating(rows[0].product_id);
    }
    return { id: numId, isApproved: Boolean(isApproved), is_approved: Boolean(isApproved) };
  },

  async delete(id) {
    const pool = getPool();
    const numId = Number(id);
    if (!numId || isNaN(numId)) {
      const err = new Error("Valid numeric review ID is required.");
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify review exists before deletion
    const [rows] = await pool.query(
      "SELECT `id`, `product_id`, `images` FROM `product_reviews` WHERE `id` = ?",
      [numId]
    );

    if (!rows || rows.length === 0) {
      const err = new Error(`Review with ID ${numId} not found.`);
      err.statusCode = 404;
      throw err;
    }

    const productId = rows[0]?.product_id;

    // 2. Run delete in a transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM `product_reviews` WHERE `id` = ?", [numId]);
      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    // 3. Recalculate product rating & count in its own try/catch so it cannot break the delete
    if (productId) {
      try {
        await this.syncProductRating(productId);
      } catch (ratingErr) {
        console.error("Warning: failed to sync product rating after review delete:", ratingErr?.message || ratingErr);
      }
    }

    return true;
  },
};

module.exports = Review;

