-- app.sql (FIXED AND CLEANED)
DROP DATABASE IF EXISTS menstrual_health_app;
CREATE DATABASE menstrual_health_app;
USE menstrual_health_app;

-- Users Table (Updated for Firebase + Phone auth)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) DEFAULT 'User',
  username VARCHAR(255) UNIQUE,
  email VARCHAR(255),
  password VARCHAR(255), -- For legacy compatibility
  google_id VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20) UNIQUE,
  otp VARCHAR(6),
  expiry DATETIME,
  verified BOOLEAN DEFAULT FALSE,
  isadmin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fcm_token VARCHAR(255),
  last_login TIMESTAMP NULL,
  firebase_uid VARCHAR(255) UNIQUE,
  photo_url VARCHAR(500),
  UNIQUE KEY unique_identity (email, phone_number)
);

-- Profile Table
CREATE TABLE profile (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  age INT,
  weight DECIMAL(5,2),
  height DECIMAL(5,2),
  cycle_length INT,
  last_period_date DATE,
  age_at_menarche INT,
  flow_regularity ENUM('regular', 'usually_regular', 'usually_irregular', 'always_irregular'),
  bleeding_duration INT,
  flow_amount ENUM('light', 'moderate', 'heavy'),
  period_interval INT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id)
);

-- Notification Types Table
CREATE TABLE notification_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system_generated BOOLEAN DEFAULT FALSE,
  icon_name VARCHAR(50),
  color_code VARCHAR(7)
);

-- Notifications Table
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_id INT NOT NULL,
  sender_id INT,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (type_id) REFERENCES notification_types(id),
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
);

-- User Notifications Junction Table
CREATE TABLE user_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  notification_id INT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, notification_id)
);

-- User Notification Preferences Table
CREATE TABLE user_notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id)
);

-- Menstrual Cycles Table
CREATE TABLE menstrual_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_cycles (user_id, start_date)
);

-- Daily Notes Table
CREATE TABLE daily_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  note_date DATE NOT NULL,
  content TEXT,
  mood ENUM('happy', 'sad', 'anxious', 'energetic', 'tired', 'normal'),
  symptoms JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_date (user_id, note_date),
  INDEX idx_user_notes (user_id, note_date)
);

-- Symptoms Table
CREATE TABLE symptoms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  symptom_date DATE NOT NULL,
  symptom_type VARCHAR(100) NOT NULL,
  severity ENUM('mild', 'moderate', 'severe'),
  notes TEXT,
  cycle_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cycle_id) REFERENCES menstrual_cycles(id) ON DELETE SET NULL,
  INDEX idx_user_symptoms (user_id, symptom_date)
);

-- Phone OTP Table (New)
CREATE TABLE phone_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone_otp (phone_number, otp),
  INDEX idx_expires (expires_at)
);

-- Insert default notification types
INSERT INTO notification_types (name, description, is_system_generated, icon_name, color_code) VALUES
('System Alert', 'Important system notifications', TRUE, 'warning', '#FFA500'),
('Health Tip', 'Period health tips and advice', TRUE, 'health_and_safety', '#4CAF50'),
('Admin Message', 'Direct message from administrator', FALSE, 'admin_panel_settings', '#9C27B0'),
('Reminder', 'System-generated reminders', TRUE, 'notifications', '#2196F3'),
('Period Alert', 'Notifications about upcoming periods', TRUE, 'event', '#E91E63'),
('Login Alert', 'Notifications about account access', TRUE, 'security', '#FF5722');

-- Create admin user
INSERT INTO users (name, username, email, password, verified, isadmin) VALUES
('Admin User', 'admin', 'admin@gmail.com', '$2b$10$imFOmcBHeP05VmdnC0Rud.7Gi8ypx4qp32R3XzKyfCyMeNksa3rUy', TRUE, TRUE);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_google ON users(google_id);
CREATE INDEX idx_users_firebase ON users(firebase_uid);
CREATE INDEX idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX idx_user_notifications_is_read ON user_notifications(is_read);
CREATE INDEX idx_notifications_type_id ON notifications(type_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Create views
CREATE VIEW user_unread_notifications AS
SELECT un.user_id, COUNT(un.id) AS unread_count
FROM user_notifications un
WHERE un.is_read = FALSE
GROUP BY un.user_id;

-- Create stored procedures
DELIMITER //
CREATE PROCEDURE mark_all_notifications_read(IN p_user_id INT)
BEGIN
  UPDATE user_notifications 
  SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id AND is_read = FALSE;
END //

CREATE PROCEDURE mark_notifications_read(
    IN p_user_id INT,
    IN p_notification_ids TEXT
)
BEGIN
    IF p_notification_ids = '' THEN
        UPDATE user_notifications 
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
        WHERE user_id = p_user_id AND is_read = FALSE;
    ELSE
        SET @sql = CONCAT(
            'UPDATE user_notifications ',
            'SET is_read = TRUE, read_at = CURRENT_TIMESTAMP ',
            'WHERE user_id = ', p_user_id, ' ',
            'AND notification_id IN (', p_notification_ids, ')'
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
  INSERT INTO user_notification_preferences (user_id) VALUES (NEW.id);
END //

CREATE PROCEDURE cleanup_expired_otps()
BEGIN
  DELETE FROM phone_verifications 
  WHERE expires_at < NOW() 
     OR (created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR) AND used = FALSE);
END //
DELIMITER ;

-- Schedule OTP cleanup
CREATE EVENT IF NOT EXISTS cleanup_expired_otps_event
ON SCHEDULE EVERY 1 HOUR
DO
  CALL cleanup_expired_otps();
  
select * from users;
-- Update the daily_notes table to include period tracking
ALTER TABLE daily_notes
ADD COLUMN is_period_day BOOLEAN DEFAULT FALSE,
ADD COLUMN pads_used INT DEFAULT 0,
ADD COLUMN period_intensity ENUM('light', 'medium', 'heavy') DEFAULT 'medium',
ADD COLUMN period_notes TEXT,
ADD INDEX idx_period_days (user_id, note_date, is_period_day);

-- Add period summary table for easier reporting
CREATE TABLE period_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  cycle_id INT,
  start_date DATE NOT NULL,
  end_date DATE,
  total_pads_used INT DEFAULT 0,
  average_intensity ENUM('light', 'medium', 'heavy'),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cycle_id) REFERENCES menstrual_cycles(id) ON DELETE SET NULL,
  UNIQUE KEY unique_user_period (user_id, start_date),
  INDEX idx_user_periods (user_id, start_date)
);

-- Create trigger to update period summary when daily notes are updated
DELIMITER //
CREATE TRIGGER after_daily_note_update_period
AFTER UPDATE ON daily_notes
FOR EACH ROW
BEGIN
    -- If period status changed or pads used changed
    IF (OLD.is_period_day != NEW.is_period_day) OR (OLD.pads_used != NEW.pads_used) THEN
        CALL update_period_summary(NEW.user_id, NEW.note_date);
    END IF;
END //

CREATE TRIGGER after_daily_note_insert_period
AFTER INSERT ON daily_notes
FOR EACH ROW
BEGIN
    IF NEW.is_period_day = TRUE THEN
        CALL update_period_summary(NEW.user_id, NEW.note_date);
    END IF;
END //

CREATE PROCEDURE update_period_summary(
    IN p_user_id INT,
    IN p_note_date DATE
)
BEGIN
    DECLARE period_start DATE;
    DECLARE period_end DATE;
    DECLARE v_cycle_id INT;
    DECLARE total_pads INT;
    DECLARE avg_intensity VARCHAR(10);
    
    -- Find the continuous period days for this user
    SELECT MIN(note_date), MAX(note_date)
    INTO period_start, period_end
    FROM daily_notes
    WHERE user_id = p_user_id 
      AND is_period_day = TRUE
      AND note_date BETWEEN DATE_SUB(p_note_date, INTERVAL 10 DAY) 
                        AND DATE_ADD(p_note_date, INTERVAL 10 DAY);
    
    -- Calculate total pads used in this period
    SELECT COALESCE(SUM(pads_used), 0)
    INTO total_pads
    FROM daily_notes
    WHERE user_id = p_user_id 
      AND is_period_day = TRUE
      AND note_date BETWEEN period_start AND period_end;
    
    -- Find the most common intensity
    SELECT period_intensity INTO avg_intensity
    FROM (
        SELECT period_intensity, COUNT(*) as count
        FROM daily_notes
        WHERE user_id = p_user_id 
          AND is_period_day = TRUE
          AND note_date BETWEEN period_start AND period_end
          AND period_intensity IS NOT NULL
        GROUP BY period_intensity
        ORDER BY count DESC
        LIMIT 1
    ) intensity_counts;
    
    -- Find the menstrual cycle that this period belongs to
    SELECT id INTO v_cycle_id
    FROM menstrual_cycles
    WHERE user_id = p_user_id 
      AND start_date <= period_start 
      AND (end_date IS NULL OR end_date >= period_end)
    ORDER BY start_date DESC
    LIMIT 1;
    
    -- Insert or update period summary
    INSERT INTO period_summary 
      (user_id, cycle_id, start_date, end_date, total_pads_used, average_intensity, notes)
    VALUES 
      (p_user_id, v_cycle_id, period_start, period_end, total_pads, avg_intensity, '')
    ON DUPLICATE KEY UPDATE
      end_date = VALUES(end_date),
      total_pads_used = VALUES(total_pads_used),
      average_intensity = VALUES(average_intensity),
      updated_at = CURRENT_TIMESTAMP;
END //
DELIMITER ;