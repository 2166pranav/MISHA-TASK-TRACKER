import re

with open('server.js', 'r') as f:
    content = f.read()

# Replace db init
content = content.replace("const store = options.store || createJsonStore(dataFile);", "await db.initDB();")

# Replace requires
content = content.replace("const fs = require('node:fs');", "const fs = require('node:fs');\nconst db = require('./db');")

# We will just write a new server.js manually. The regex approach is too flaky.
