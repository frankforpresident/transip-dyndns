

const fs = require('fs');
const ms = require('ms');
const interval = require('interval-promise');
const TransIP = require('transip');
const request = require('request-promise');
const config = require('./config.js');
const logLocation = config.get('logLocation');
const logLevel = config.get('logLevel');
const logger = require('./logger.js')(logLocation, logLevel);
const PRIVATE_KEY_LOCATION = config.get('transip.privateKeyPath');

// Load privateKeyFile contents
const TRANSIP_PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_LOCATION, { encoding: 'utf-8' });

if (!TRANSIP_PRIVATE_KEY) {
    logger.error(`PrivateKey cannot be read. Please check the location (${PRIVATE_KEY_LOCATION})`);
    process.exit(1);
}

const DOMAINS_TO_CHECK = config.get('domainsToCheck');

if (!DOMAINS_TO_CHECK.domains) {
    logger.error(`No domains found in config`);
    process.exit(1);
}

const TRANSIP_LOGIN = config.get('transip.login');
const DNS_CHECK_INTERVAL = config.get('dnsCheckInterval');

const transip = new TransIP(TRANSIP_LOGIN, TRANSIP_PRIVATE_KEY);

const dependencies = { logger, config, transip, request };
const domainService = require('./services/domainService.js')(dependencies);

const { getDomainNames, getInfo } = transip.domainService;

async function transipDynamicDns() {
    logger.info('Checking for changes');
    const startTime = new Date().getTime();

    const configDomainNames = DOMAINS_TO_CHECK.domains
        .map(({ domain }) => domain);

    const knownTransIpDomains = await getDomainNames()
        .catch((error) => {
            logger.error(`Unable to connect to transIP. Please verify account and private key`);
            logger.error(error);
            process.exit(1);
        });

    const domainsToCheck = knownTransIpDomains.filter(domain => configDomainNames.includes(domain));

    const promises = domainsToCheck.map((domainName) => {
        return getInfo(domainName)
            .then((transIpDomain) => {
                const configDomain = DOMAINS_TO_CHECK.domains
                    .find(({ domain }) => domain === domainName);

                return domainService.process(configDomain, transIpDomain);
            })
            .then(() => {
                const currentTime = new Date().getTime();
                const processingTime = currentTime - startTime;
                const nextCheck = new Date(currentTime + ms(DNS_CHECK_INTERVAL) - processingTime);
                logger.debug(`Processing time ${processingTime}`);
                logger.info(`Next check will be around ${nextCheck.toISOString()}`);
            });
    });

    return Promise.all(promises);
}

/**
 * TransIp Dynamic DNS
 * This service will update transip dns entries with a interval. When no changes detected, nothing will happen.
 * GitHub @link https://github.com/frankforpresident/transip-dynamic-dns
 */
return transipDynamicDns()
    .then(interval(transipDynamicDns, ms(DNS_CHECK_INTERVAL)));
