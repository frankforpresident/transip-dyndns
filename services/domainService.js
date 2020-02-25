module.exports = function domainService({ logger, config, transip, request }) {

    /**
     * A basic function that will retrieve the current WAN address
     * @returns {Promise<T | never>} - Current IP
     * @private
     */
    async function getWanIP() {
        const wanCheckServiceURL = config.get('wanCheckURL');
        return request(wanCheckServiceURL)
            .then((ip) => ip.trim())
            .catch((err) => {
                throw new Error('Error while loading url. \n' + err.message);
            });
    }

    /**
     * Main function to update a domain and its entries
     *
     * @param {object} configDomain - domain object from config
     * @param {object} transIpDomain - domain object from transIp
     * @returns {Promise} *
     */
    async function process(configDomain, transIpDomain) {

        if (!configDomain) {
            logger.warn('No config domain received. Nothing to change.');
            return null;
        }

        if (!transIpDomain) {
            logger.warn('No transIp domain received. Nothing to change.');
            return null;
        }

        const currentIP = await getWanIP();
        logger.info(`Current ip: ${currentIP}`);

        const mappedEntries = transIpDomain.dnsEntries
            .map((dnsEntry) => {

                logger.debug(`processing dnsEntry ${JSON.stringify(dnsEntry)} for domain ${transIpDomain.name}`);

                const configEntry = configDomain.dnsEntries
                    .find(configEntry => configEntry.name === dnsEntry.name && configEntry.type === dnsEntry.type);

                if (configEntry) {
                    const content = configEntry.content || currentIP;

                    if (content !== dnsEntry.content) {
                        logger.info('Entry changed: ', currentIP);
                        //Merge the current entry with ours
                        const updatedEntry = Object.assign({}, dnsEntry, { content });

                        return {
                            changed: true,
                            dnsEntry: updatedEntry
                        };
                    }
                }

                return {
                    changed: false,
                    dnsEntry
                };
            });

        if (mappedEntries.every(({ changed }) => !changed)) {
            logger.info('Nothing changed.');
            return null;
        }

        const updatedEntries = mappedEntries.map(({ dnsEntry }) => dnsEntry);
        return updateEntries(transIpDomain.name, updatedEntries);
    }

    /**
     * Will update the dns entries
     * @Note: Please note that this function will replace all DNS entries
     * @param {string} domainName - domain name
     * @param {array} dnsEntries - updated entries
     * @returns {Promise<T | never>} - true
     */
    async function updateEntries(domainName, dnsEntries) {
        return transip.domainService.setDnsEntries(domainName, { item: dnsEntries })
            .catch((error) => {
                logger.error(`Unable to set dns entries for ${domainName}`);
                logger.error(error);
                return Promise.reject(error);
            });
    }

    return {
        process,
    };
};

