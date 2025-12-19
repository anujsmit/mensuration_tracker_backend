-- anujsmit/mensuration_tracker_backend/mensuration_tracker_backend-b270fad9aad702aa4e349ee6e2e2cfd2756512dc/app.sql (FIXED AND CLEANED)
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
  UNIQUE KEY unique_identity_email (email),
  UNIQUE KEY unique_identity_phone (phone_number)
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

-- REMOVED: phone_verifications table, cleanup_expired_otps stored procedure and event.

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
  
  -- Create initial profile entry
  INSERT INTO profile (user_id) VALUES (NEW.id);

  -- Send welcome notification (System Alert - type_id 1)
  INSERT INTO notifications 
  (type_id, title, message) 
  VALUES (1, 'Welcome to Menstrual Tracker!', 'Start tracking your menstrual health journey.');

  SET @notificationId = LAST_INSERT_ID();

  INSERT INTO user_notifications (user_id, notification_id) 
  VALUES (NEW.id, @notificationId);
END //

DELIMITER ;