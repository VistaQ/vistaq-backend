import { writeFileSync } from 'fs';

import { generateApiTypes, TYPES_PATH } from './generateApiTypes';

void (async () => {
  writeFileSync(TYPES_PATH, await generateApiTypes());
})();
