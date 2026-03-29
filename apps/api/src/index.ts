import { startApp } from './start.js';

startApp().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
