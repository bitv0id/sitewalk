#!/usr/bin/env node
import { run } from '../src/main.js';

run(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exitCode = 2;
    });
