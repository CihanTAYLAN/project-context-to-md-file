#!/usr/bin/env node

try {
    require('../dist/index.js');
} catch (err) {
    console.error('Error starting project-context-to-md-file:', err.message);
    process.exit(1);
} 