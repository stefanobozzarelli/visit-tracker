import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import '../styles/Profile.css';

export const Profile: React.FC = () => {
  const { user } = useAuth();

  // Profile
  const [name, setName] = useState(user?.name || '');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(''); setProfileSuccess('');
    if (!name.trim()) { setProfileError('Name is required'); return; }
    try {
      setProfileLoading(true);
      const res = await apiService.updateProfile({ name: name.trim() });
      if (res.success) {
        setProfileSuccess('Profile updated successfully');
        // Update local storage user data
        const stored = localStorage.getItem('user');
        if (stored) {
          const userData = JSON.parse(stored);
          userData.name = name.trim();
          localStorage.setItem('user', JSON.stringify(userData));
        }
      } else {
        setProfileError(res.error || 'Failed to update profile');
      }
    } catch (err) {
      setProfileError((err as Error).message || 'Error updating profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(''); setPasswordSuccess('');
    if (!currentPassword || !newPassword) {
      setPasswordError('All fields are required'); return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters'); return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match'); return;
    }
    try {
      setPasswordLoading(true);
      const res = await apiService.changeMyPassword(currentPassword, newPassword);
      if (res.success) {
        setPasswordSuccess('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(res.error || 'Failed to change password');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error changing password';
      setPasswordError(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <h1>My Profile</h1>
      <p className="profile-subtitle">Manage your account settings</p>

      <div className="profile-grid">
        {/* Profile Info */}
        <div className="profile-card">
          <h3>Profile Information</h3>
          {profileError && <div className="profile-alert error">{profileError}</div>}
          {profileSuccess && <div className="profile-alert success">{profileSuccess}</div>}

          <form onSubmit={handleProfileUpdate}>
            <div className="profile-form-group">
              <label>Email</label>
              <input type="email" value={user?.email || ''} disabled />
              <span className="profile-hint">Email cannot be changed</span>
            </div>
            <div className="profile-form-group">
              <label>Role</label>
              <input type="text" value={user?.role || ''} disabled />
            </div>
            <div className="profile-form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <button type="submit" className="profile-btn primary" disabled={profileLoading}>
              {profileLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="profile-card">
          <h3>Change Password</h3>
          {passwordError && <div className="profile-alert error">{passwordError}</div>}
          {passwordSuccess && <div className="profile-alert success">{passwordSuccess}</div>}

          <form onSubmit={handlePasswordChange}>
            <div className="profile-form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="profile-form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
            <div className="profile-form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
              />
            </div>
            <button type="submit" className="profile-btn primary" disabled={passwordLoading}>
              {passwordLoading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
