import 'dotenv/config';
import { app } from './app.js';
import { prisma } from './lib/prisma.js';

export { prisma };

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Footy Tips API running on http://localhost:${PORT}`);
});
