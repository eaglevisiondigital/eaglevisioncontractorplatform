import { defineConfig } from 'vitest/config';
import original from '../../vite.config';

export default defineConfig({
  ...original,
  test: {
    ...original.test,
    include: ['tests/database/v1-intake-current-authority.spec.ts'],
  },
});
