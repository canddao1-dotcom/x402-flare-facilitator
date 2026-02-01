#!/usr/bin/env node
/**
 * Alert script - sends arb opportunity to main session via file trigger
 * The heartbeat will pick this up and alert the brain
 */

const fs = require('fs');
const path = require('path');

const ALERT_FILE = path.join(__dirname, '..', 'data', 'pending-alert.json');

function sendAlert(opportunity) {
  const alert = {
    timestamp: Date.now(),
    type: 'arb_opportunity',
    data: opportunity,
    read: false,
  };
  
  fs.writeFileSync(ALERT_FILE, JSON.stringify(alert, null, 2));
  console.log('Alert written:', ALERT_FILE);
}

// Called from scanner
if (require.main === module) {
  const data = JSON.parse(process.argv[2] || '{}');
  sendAlert(data);
}

module.exports = { sendAlert, ALERT_FILE };
