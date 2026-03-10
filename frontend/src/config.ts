// Central configuration file
export const config = {
  API_BASE_URL: (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:5001/api',
};
