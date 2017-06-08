// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/* eslint-disable global-require */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

const chalk = require('chalk');
const ProxyAgent = require('https-proxy-agent');

const pkg = require(path.resolve(path.join(__dirname, '..', '..', 'package.json')));

let instance = null;

class COSI {

    /**
     * initialize cosi instance
     */
    constructor() { // eslint-disable-line max-statements
        if (instance !== null) {
            return instance;
        }

        instance = this;  // eslint-disable-line consistent-this

        instance.app_name = pkg.name;
        instance.app_version = pkg.version;
        instance.description = pkg.description;
        instance.bug_url = pkg.bugs.url;
        instance.support_url = 'https://support.circonus.com/';

        instance.cosi_dir = path.resolve(path.join(__dirname, '..', '..'));
        instance.lib_dir = __dirname;
        instance.etc_dir = path.resolve(path.join(instance.cosi_dir, 'etc'));
        instance.log_dir = path.resolve(path.join(instance.cosi_dir, 'log'));
        instance.reg_dir = path.resolve(path.join(instance.cosi_dir, 'registration'));
        instance.ruleset_dir = path.resolve(path.join(instance.cosi_dir, 'rulesets'));

        // derive nad etc directory (different based on what version of nad)
        instance.nad_etc_dir = path.resolve(path.join(instance.cosi_dir, '..', 'nad', 'etc'));
        instance.nad_version = 2;
        try {
            fs.accessSync(instance.nad_etc_dir, fs.F_OK);
        } catch (nadv2Err) {
            if (nadv2Err.code !== 'ENOENT') {
                console.error(chalk.red(`ERROR`), nadv2Err);
                process.exit(1);
            }

            // otherwise, check for nad v1
            try {
                fs.accessSync(path.resolve(path.join(instance.cosi_dir, '..', 'sbin', 'nad')), fs.F_OK);
                instance.nad_etc_dir = path.resolve(path.join(instance.cosi_dir, '..', 'etc'));
                instance.nad_version = 1;
            } catch (nadv1Err) {
                console.error(chalk.red(`ERROR`), nadv1Err);
                process.exit(1);
            }
        }


        const configFile = path.resolve(path.join(instance.etc_dir, 'cosi.json'));
        let cfg = {};

        try {
            cfg = require(configFile);
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                console.error(chalk.red(`Configuration file '${configFile}' not found!`));
                process.exit(1);
            } else {
                throw err;
            }
        }

        const requiredSettings = [
            'api_key',
            'api_app',
            'api_url',
            'cosi_url',
            'agent_mode',
            'agent_url',
            'cosi_os_type',
            'cosi_os_dist',
            'cosi_os_vers',
            'cosi_os_arch'
        ];

        for (const prop of requiredSettings) {
            if ({}.hasOwnProperty.call(cfg, prop)) {
                instance[prop] = cfg[prop];
            } else {
                console.error(chalk.red('ERROR'), 'configuration missing required setting', prop);
                process.exit(1);
            }
        }

        // additional settings (previous installs may not have these settings on a cosi re-run)
        const optionalSettings = [
            'cosi_host_target',
            'cosi_broker_id',
            'cosi_broker_type',
            'cosi_group_id'
        ];

        for (const prop of optionalSettings) {
            if ({}.hasOwnProperty.call(cfg, prop) && cfg[prop] !== '') {
                instance[prop] = cfg[prop];
            }
        }

        // used for aws public hostname detection for check target
        if ({}.hasOwnProperty.call(cfg, 'cosi_os_dmi') && cfg.cosi_os_dmi !== '') {
            instance.dmi_bios_ver = cfg.cosi_os_dmi;
        }

        const idFile = path.resolve(path.join(instance.etc_dir, '.cosi_id'));

        try {
            const cosi_id = fs.readFileSync(idFile, { encoding: 'utf8' });

            instance.cosi_id = cosi_id.trim();
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                console.error('Unable to read', idFile, readError);
                process.exit(1);
            }

            instance.cosi_id = crypto.
                createHash('sha256').
                update(crypto.randomBytes(2048)).
                digest('hex');
            try {
                fs.writeFileSync(idFile, instance.cosi_id);
            } catch (writeError) {
                console.error('Unable to save', idFile, writeError);
                process.exit(1);
            }
        }

        instance.custom_options = {};
        if ({}.hasOwnProperty.call(cfg, 'custom_options_file') && cfg.custom_options_file.length > 0) {
            const custCfgFile = path.resolve(cfg.custom_options_file);

            try {
                instance.custom_options = require(custCfgFile);
            } catch (custCfgErr) {
                console.error(chalk.red('ERROR'), 'unable to load specified custom options file', custCfgErr);
                process.exit(1);
            }
        }

        instance.ui_url = null;
        try {
            const regInfoFile = path.resolve(path.join(__dirname, '..', '..', 'registration', 'setup-config.json'));
            const info = require(regInfoFile);

            instance.ui_url = info.account.ui_url;
        } catch (ignoreErr) {
            // ignore
        }

        return instance;
    }

    /**
     * set up request object with proxy settings if applicable
     * @arg {String} reqUrl request url
     * @returns {Object} request options with proxy server (if any)
     */
    getProxySettings(reqUrl) {
        const reqOptions = url.parse(reqUrl);
        const proxyServer = this._getProtocolProxyUrl(reqOptions.protocol);

        reqOptions.agent = false;
        if (proxyServer !== null) {
            reqOptions.agent = new ProxyAgent(proxyServer);
        }

        return reqOptions;
    }

    /**
     * extract proxy setting from environment for a specific protocol
     * @arg {String} urlProtocol protocol
     * @returns {String} proxy url or null
     */
    _getProtocolProxyUrl(urlProtocol) { // eslint-disable-line class-methods-use-this
        let proxyServer = null;

        if (urlProtocol === 'http:') {
            if ({}.hasOwnProperty.call(process.env, 'http_proxy')) {
                proxyServer = process.env.http_proxy;
            } else if ({}.hasOwnProperty.call(process.env, 'HTTP_PROXY')) {
                proxyServer = process.env.HTTP_PROXY;
            }
        } else if (urlProtocol === 'https:') {
            if ({}.hasOwnProperty.call(process.env, 'https_proxy')) {
                proxyServer = process.env.https_proxy;
            } else if ({}.hasOwnProperty.call(process.env, 'HTTPS_PROXY')) {
                proxyServer = process.env.HTTPS_PROXY;
            }
        }
        if (proxyServer !== null && proxyServer !== '') {
            if (!proxyServer.match(/^http[s]?:\/\//)) {
                proxyServer = `http://${proxyServer}`;
            }
        }

        return proxyServer;
    }

}

module.exports = new COSI();
