This is a little package to get the configuration of your package that you can override using "npm config set ...".<br/>
<br/>
Normally, this information is only accessible when your script is invoked by "npm run".<br/>
<br/>
NPM is not very friendly with this wonderful feature. There is no API, and no '--json' option to 'npm config list'.<br/>
<br/>
Usage:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;const npc = require('npm-package-config');<br/>
&nbsp;&nbsp;&nbsp;&nbsp;const result = npc.list([package_name], [options]);<br/>
<br/>
New since version 0.5.0:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;const result = npc.listSync([package_name], [options]);<br/>
&nbsp;&nbsp;&nbsp;&nbsp;const result = npc.listAsync([package_name], [options]);<br/>
</br>
Where:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"package_name" : (optional) Name of the package<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"options" : (optional) An object which provide options by key/value pairs.<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"result" : The result of the function.<br/>
<br/>
Options:</br>
&nbsp;&nbsp;&nbsp;&nbsp;"async" : ("npc.list" only) When 'true', the function will return a Promise. When 'false', the function will return the result. Default is 'false'.<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"Promise" : Provides the Promise constructor. Default is 'global.Promise'.<br/>
&nbsp;&nbsp;&nbsp;&nbsp;"module" : Provides the Node.js module object used to resolve files. Default is the parent module of 'npm-package-config'.<br/>