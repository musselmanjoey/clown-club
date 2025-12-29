-- Record Store Database Schema
-- Tables for vinyl collection and reviews

-- Vinyl collection
CREATE TABLE IF NOT EXISTS vinyl_records (
    id SERIAL PRIMARY KEY,
    spotify_album_id VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    year INTEGER,
    genre VARCHAR(100),
    format VARCHAR(50), -- LP, 7", 12", etc.
    condition VARCHAR(50), -- Mint, Near Mint, VG+, VG, G+, G, Fair, Poor
    cover_image_url TEXT, -- Scanned cover image URL
    spine_color VARCHAR(7), -- Hex color for visual display (e.g., #FF5733)
    shelf_position JSONB, -- { "shelf": 1, "slot": 3 }
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Record reviews (one review per vinyl record)
CREATE TABLE IF NOT EXISTS record_reviews (
    id SERIAL PRIMARY KEY,
    vinyl_id INTEGER UNIQUE REFERENCES vinyl_records(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    content TEXT,
    standout_tracks TEXT[], -- Array of track names
    images JSONB, -- Array of scanned image URLs [{ "url": "...", "caption": "..." }]
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_vinyl_spotify_id ON vinyl_records(spotify_album_id);
CREATE INDEX IF NOT EXISTS idx_vinyl_genre ON vinyl_records(genre);
CREATE INDEX IF NOT EXISTS idx_vinyl_artist ON vinyl_records(artist);
CREATE INDEX IF NOT EXISTS idx_review_vinyl_id ON record_reviews(vinyl_id);

-- Trigger to update updated_at on vinyl_records
CREATE OR REPLACE FUNCTION update_vinyl_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vinyl_updated_at
    BEFORE UPDATE ON vinyl_records
    FOR EACH ROW
    EXECUTE FUNCTION update_vinyl_timestamp();

CREATE TRIGGER trigger_review_updated_at
    BEFORE UPDATE ON record_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_vinyl_timestamp();
