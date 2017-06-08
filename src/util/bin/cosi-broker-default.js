#!/usr/bin/env node

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const path = require('path');

const app = require('commander');
const chalk = require('chalk');

const cosi = require(path.resolve(path.join(__dirname, '..', 'lib', 'cosi')));
const Broker = require(path.join(cosi.lib_dir, 'broker'));

app.
    version(cosi.app_version).
    parse(process.argv);

console.log(chalk.bold(app.name()), `v${app.version()}`);

const bh = new Broker(false);
let checkType = 'json';

console.log(cosi.cosi_os_type, cosi.cosi_os_dist, `v${cosi.cosi_os_vers}`, cosi.cosi_os_arch, cosi.agent_mode, 'agent mode.');

console.log(chalk.bold('====='));
console.log('Determining default broker for check type', checkType);

bh.getDefaultBroker(checkType).
    then((broker) => {
        console.log(chalk.bold('Default broker'), `for check type '${checkType}':`, broker._cid.replace('/broker/', ''), '-', broker._name);

        checkType = 'httptrap';
        console.log(chalk.bold('====='));
        console.log('Determining default broker for check type', checkType);

        return bh.getDefaultBroker(checkType);
    }).
    then((broker) => {
        console.log(chalk.bold('Default broker'), `for check type '${checkType}':`, broker._cid.replace('/broker/', ''), '-', broker._name);
    }).
    catch((err) => {
        console.log(chalk.red('ERROR:'), 'unable to identify default broker for', checkType, err);
        process.exit(1);
    });
