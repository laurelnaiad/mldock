var pkg = require('../package.json');
var fsx = require('fs-extra');
var path = require('path');

delete pkg['scripts-info'];
delete pkg.scripts;
delete pkg.devDependencies;
delete pkg.nyc;

fsx.writeFileSync('dist/package.json', JSON.stringify(pkg, null, 2));
fsx.writeFileSync('dist/README.md', fsx.readFileSync('./README.md').toString());
fsx.writeFileSync('dist/LICENSE.txt', fsx.readFileSync('./LICENSE.txt').toString());
