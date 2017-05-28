This is a little package to get the configuration of your package that you can override using "npm config set ...".

Normally, this information is only accessible when your script is invoked by "npm run".
NPM's commands are not very friendly with this wonderful feature. There is no API, and no '--json' option to 'npm config list'. So it was difficult to write a package that does it.

Usage:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;const result = require('npm-package-config').list([package_name], [options]);

Where:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"package_name" : (optional) name of the package<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"options"      : (optional) an object with options. "async" : When true, the function will return a Promise. When false, the function will return the result. Default is false.<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"result"       : The result of the function.<br/>
