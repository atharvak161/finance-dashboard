// auth.js — authentication removed
export async function login() { return true; }
export async function logout() {}
export async function isAuthenticated() { return true; }
export function startInactivityTimer() {}
export function changePassword() {}
export function getEncKey() { return null; }
export async function reEncryptAll() {}
export async function authenticate() { return null; }
export function checkLockout() { return { locked: false, remainingMs: 0 }; }
