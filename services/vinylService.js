const db = require('../database/connection');

/**
 * VinylService - Data access layer for vinyl collection and reviews
 * Uses the unified music reviews schema (artists -> albums -> reviews)
 */
class VinylService {
  /**
   * Get vinyl collection for Record Store display
   * Only returns albums where owned_on_vinyl = TRUE
   */
  async getVinylCollection({ genre, limit = 100, offset = 0 } = {}) {
    let query = `
      SELECT * FROM vinyl_collection
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (genre) {
      query = `
        SELECT vc.* FROM vinyl_collection vc
        JOIN album_genres ag ON ag.album_id = vc.id
        JOIN genres g ON g.id = ag.genre_id
        WHERE g.name = $${paramIndex++}
      `;
      params.push(genre);
    }

    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get a single album with full details and review
   */
  async getAlbumById(id) {
    const query = `
      SELECT
        al.*,
        a.name as artist_name,
        a.spotify_id as artist_spotify_id,
        r.id as review_id,
        r.rating,
        r.review_text,
        r.listen_count,
        r.source,
        r.standout_tracks,
        r.scanned_images,
        r.date_reviewed
      FROM albums al
      JOIN artists a ON a.id = al.artist_id
      LEFT JOIN reviews r ON r.album_id = al.id
      WHERE al.id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get album by Spotify ID
   */
  async getAlbumBySpotifyId(spotifyId) {
    const query = `
      SELECT
        al.*,
        a.name as artist_name,
        r.rating,
        r.review_text
      FROM albums al
      JOIN artists a ON a.id = al.artist_id
      LEFT JOIN reviews r ON r.album_id = al.id
      WHERE al.spotify_id = $1
    `;
    const result = await db.query(query, [spotifyId]);
    return result.rows[0] || null;
  }

  /**
   * Search albums by title or artist
   */
  async searchAlbums(searchQuery) {
    const query = `
      SELECT
        al.*,
        a.name as artist_name,
        r.rating
      FROM albums al
      JOIN artists a ON a.id = al.artist_id
      LEFT JOIN reviews r ON r.album_id = al.id
      WHERE al.title ILIKE $1 OR a.name ILIKE $1
      ORDER BY a.name, al.release_year
      LIMIT 50
    `;
    const result = await db.query(query, [`%${searchQuery}%`]);
    return result.rows;
  }

  /**
   * Get ranked reviews
   */
  async getRankedReviews(limit = 20) {
    const query = `
      SELECT * FROM ranked_reviews
      LIMIT $1
    `;
    const result = await db.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get all genres
   */
  async getGenres() {
    const result = await db.query('SELECT * FROM genres ORDER BY name');
    return result.rows;
  }

  /**
   * Get review for an album
   */
  async getReview(albumId) {
    const query = `
      SELECT
        r.*,
        al.title as album_title,
        a.name as artist_name,
        al.cover_url
      FROM reviews r
      JOIN albums al ON al.id = r.album_id
      JOIN artists a ON a.id = al.artist_id
      WHERE r.album_id = $1
    `;
    const result = await db.query(query, [albumId]);
    return result.rows[0] || null;
  }

  /**
   * Get all reviews ordered by date
   */
  async getAllReviews({ limit = 20, source } = {}) {
    let query = `
      SELECT
        r.*,
        al.title as album_title,
        a.name as artist_name,
        al.cover_url,
        al.release_year
      FROM reviews r
      JOIN albums al ON al.id = r.album_id
      JOIN artists a ON a.id = al.artist_id
    `;
    const params = [];
    let paramIndex = 1;

    if (source) {
      query += ` WHERE r.source = $${paramIndex++}`;
      params.push(source);
    }

    query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;
  }

  // ========== Admin/CRUD Operations ==========

  /**
   * Get or create artist by name
   */
  async getOrCreateArtist(name, spotifyId = null) {
    // Try to find existing
    const existing = await db.query(
      'SELECT * FROM artists WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }

    // Create new
    const result = await db.query(
      'INSERT INTO artists (name, spotify_id) VALUES ($1, $2) RETURNING *',
      [name, spotifyId]
    );
    return result.rows[0];
  }

  /**
   * Create a new album
   */
  async createAlbum(album) {
    // First get or create artist
    const artist = await this.getOrCreateArtist(album.artist, album.artist_spotify_id);

    const query = `
      INSERT INTO albums (
        artist_id, title, release_year, cover_url, spotify_id,
        owned_on_vinyl, format, condition, spine_color, shelf_position
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const params = [
      artist.id,
      album.title,
      album.release_year || null,
      album.cover_url || null,
      album.spotify_id || null,
      album.owned_on_vinyl || false,
      album.format || null,
      album.condition || null,
      album.spine_color || null,
      album.shelf_position ? JSON.stringify(album.shelf_position) : null,
    ];

    const result = await db.query(query, params);
    return result.rows[0];
  }

  /**
   * Update an album
   */
  async updateAlbum(id, updates) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = [
      'title', 'release_year', 'cover_url', 'spotify_id',
      'owned_on_vinyl', 'format', 'condition', 'spine_color', 'shelf_position'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const value = field === 'shelf_position' ? JSON.stringify(updates[field]) : updates[field];
        fields.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(id);
    const query = `UPDATE albums SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, params);
    return result.rows[0];
  }

  /**
   * Create or update a review
   */
  async upsertReview(albumId, review) {
    // Check if review exists
    const existing = await db.query('SELECT id FROM reviews WHERE album_id = $1', [albumId]);

    if (existing.rows[0]) {
      // Update
      const query = `
        UPDATE reviews SET
          review_text = $2,
          rating = $3,
          listen_count = $4,
          source = $5,
          standout_tracks = $6,
          scanned_images = $7,
          date_reviewed = $8,
          updated_at = NOW()
        WHERE album_id = $1
        RETURNING *
      `;
      const result = await db.query(query, [
        albumId,
        review.review_text,
        review.rating || null,
        review.listen_count || 1,
        review.source || 'typed',
        review.standout_tracks || [],
        review.scanned_images ? JSON.stringify(review.scanned_images) : null,
        review.date_reviewed || null,
      ]);
      return result.rows[0];
    } else {
      // Insert
      const query = `
        INSERT INTO reviews (
          album_id, review_text, rating, listen_count, source,
          standout_tracks, scanned_images, date_reviewed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const result = await db.query(query, [
        albumId,
        review.review_text,
        review.rating || null,
        review.listen_count || 1,
        review.source || 'typed',
        review.standout_tracks || [],
        review.scanned_images ? JSON.stringify(review.scanned_images) : null,
        review.date_reviewed || null,
      ]);
      return result.rows[0];
    }
  }

  /**
   * Delete an album (cascades to reviews)
   */
  async deleteAlbum(id) {
    const result = await db.query('DELETE FROM albums WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  /**
   * Get collection statistics
   */
  async getStats() {
    const query = `
      SELECT
        COUNT(DISTINCT al.id) as total_albums,
        COUNT(DISTINCT al.id) FILTER (WHERE al.owned_on_vinyl) as vinyl_count,
        COUNT(DISTINCT a.id) as total_artists,
        COUNT(DISTINCT r.id) as total_reviews,
        AVG(r.rating)::numeric(2,1) as avg_rating,
        SUM(r.listen_count) as total_listens
      FROM albums al
      JOIN artists a ON a.id = al.artist_id
      LEFT JOIN reviews r ON r.album_id = al.id
    `;
    const result = await db.query(query);
    return result.rows[0];
  }

  /**
   * Add genre to album
   */
  async addGenreToAlbum(albumId, genreName) {
    // Get or create genre
    let genre = await db.query('SELECT * FROM genres WHERE LOWER(name) = LOWER($1)', [genreName]);
    if (!genre.rows[0]) {
      genre = await db.query('INSERT INTO genres (name) VALUES ($1) RETURNING *', [genreName]);
    }

    await db.query(
      'INSERT INTO album_genres (album_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [albumId, genre.rows[0].id]
    );
  }
}

module.exports = new VinylService();
