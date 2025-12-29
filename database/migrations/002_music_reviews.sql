-- Music Reviews + Record Store Unified Schema
-- Merges normalized structure from music-reviews with vinyl-specific fields

-- Artists table (normalized)
CREATE TABLE IF NOT EXISTS artists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    spotify_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Albums table (with vinyl collection fields)
CREATE TABLE IF NOT EXISTS albums (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    release_year INTEGER,
    cover_url TEXT,
    spotify_id VARCHAR(100),

    -- Vinyl collection fields (NULL if not owned on vinyl)
    owned_on_vinyl BOOLEAN DEFAULT FALSE,
    format VARCHAR(50),              -- LP, 7", 12", CD, digital
    condition VARCHAR(50),           -- Mint, Near Mint, VG+, VG, G+, G, Fair, Poor
    spine_color VARCHAR(7),          -- Hex color for Record Store visual
    shelf_position JSONB,            -- { "shelf": 1, "slot": 3 }

    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(artist_id, title)
);

-- Reviews table (with rating + listen count)
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
    review_text TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    listen_count INTEGER DEFAULT 1,
    source VARCHAR(50) CHECK (source IN ('handwritten', 'claude', 'typed', 'other')),
    standout_tracks TEXT[],          -- Array of track names
    scanned_images JSONB,            -- Array of scanned image URLs
    date_reviewed DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Genres (many-to-many)
CREATE TABLE IF NOT EXISTS genres (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS album_genres (
    album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
    genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (album_id, genre_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
CREATE INDEX IF NOT EXISTS idx_albums_vinyl ON albums(owned_on_vinyl) WHERE owned_on_vinyl = TRUE;
CREATE INDEX IF NOT EXISTS idx_albums_spotify ON albums(spotify_id);
CREATE INDEX IF NOT EXISTS idx_reviews_album ON reviews(album_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reviews_updated
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- View for ranked reviews
CREATE OR REPLACE VIEW ranked_reviews AS
SELECT
    r.id,
    a.name AS artist,
    al.title AS album,
    al.release_year,
    al.cover_url,
    al.owned_on_vinyl,
    al.spine_color,
    r.rating,
    r.listen_count,
    r.review_text,
    r.source,
    r.standout_tracks,
    r.date_reviewed,
    -- Ranking score: combination of listen count and rating
    -- Adjust weights as needed
    (COALESCE(r.listen_count, 1) * 10 + COALESCE(r.rating, 3) * 5) AS rank_score
FROM reviews r
JOIN albums al ON r.album_id = al.id
JOIN artists a ON al.artist_id = a.id
ORDER BY rank_score DESC;

-- View for vinyl collection (Record Store display)
CREATE OR REPLACE VIEW vinyl_collection AS
SELECT
    al.id,
    a.name AS artist,
    al.title,
    al.release_year,
    al.cover_url,
    al.format,
    al.condition,
    al.spine_color,
    al.shelf_position,
    al.spotify_id,
    r.rating,
    r.review_text IS NOT NULL AS has_review
FROM albums al
JOIN artists a ON al.artist_id = a.id
LEFT JOIN reviews r ON r.album_id = al.id
WHERE al.owned_on_vinyl = TRUE
ORDER BY al.shelf_position->>'shelf', al.shelf_position->>'slot';

-- Seed some common genres
INSERT INTO genres (name) VALUES
    ('Rock'),
    ('Electronic'),
    ('Hip-Hop'),
    ('Jazz'),
    ('Soul'),
    ('R&B'),
    ('Indie'),
    ('Alternative'),
    ('Pop'),
    ('Metal'),
    ('Folk'),
    ('Classical'),
    ('Punk'),
    ('Funk'),
    ('Blues')
ON CONFLICT (name) DO NOTHING;
