const fs = require('fs');
const path = require('path');

describe('expand/contract migration policy', () => {
  test('all migrations are reversible and keep destructive operations in down', () => {
    const directory = path.join(__dirname, '../db/migrations');
    for (const name of fs.readdirSync(directory).filter(file => file.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(directory, name), 'utf8');
      const up = source.indexOf('exports.up');
      const down = source.indexOf('exports.down');
      expect(up).toBeGreaterThanOrEqual(0);
      expect(down).toBeGreaterThan(up);
      expect(source.slice(up, down)).not.toMatch(/drop(?:Table|Column)|renameColumn/);
    }
  });
});
