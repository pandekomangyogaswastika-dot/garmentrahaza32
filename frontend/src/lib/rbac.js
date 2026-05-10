/**
 * RBAC utility helpers.
 * RequirePerm: render children only if user has required permissions.
 * PermissionDenied: fallback UI when permission check fails.
 */
import React from 'react';

/**
 * Check if user has the required permission keys.
 * @param {object} user - user object with permissions array
 * @param {string[]} keys - required permission keys
 */
export function hasPerm(user, keys = []) {
  if (!user) return false;
  const perms = user.permissions || user._permissions || [];
  if (perms.includes('*')) return true;
  return keys.every((k) => perms.includes(k));
}

/**
 * Render children if user has all required permissions.
 * Otherwise, render fallback (default: nothing).
 */
export function RequirePerm({ user, keys = [], fallback = null, children }) {
  if (hasPerm(user, keys)) return children;
  return fallback;
}

/**
 * Permission denied placeholder component.
 */
export function PermissionDenied({ missing = [] }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-400/25 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0-6V9m0 0V7m0 2a4 4 0 100-8 4 4 0 000 8zm0 0v2" />
        </svg>
      </div>
      <div className="text-sm font-semibold text-foreground">Akses Ditolak</div>
      <div className="text-xs text-muted-foreground mt-1">
        Anda tidak memiliki izin untuk halaman ini.
        {missing.length > 0 && (
          <span className="block mt-0.5">Butuh: {missing.join(', ')}</span>
        )}
      </div>
    </div>
  );
}
