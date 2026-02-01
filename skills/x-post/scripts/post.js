#!/usr/bin/env node

/**
 * X/Twitter Posting Script
 * Uses Twitter API v2 with OAuth 1.0a User Context
 * 
 * Usage:
 *   node post.js "Tweet text" [--confirm] [--reply-to <tweet_id>]
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load credentials
const envPath = '/home/node/clawd/.secrets/x-api.env';
let credentials = {};

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      credentials[match[1].trim()] = match[2].trim();
    }
  });
} catch (e) {
  console.error('❌ Failed to load credentials from', envPath);
  process.exit(1);
}

const CONSUMER_KEY = credentials.X_CONSUMER_KEY;
const CONSUMER_SECRET = credentials.X_CONSUMER_SECRET;
const ACCESS_TOKEN = credentials.X_ACCESS_TOKEN;
const ACCESS_TOKEN_SECRET = credentials.X_ACCESS_TOKEN_SECRET;

if (!CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
  console.error('❌ Missing credentials in', envPath);
  process.exit(1);
}

// Rate limit tracking
const rateLimitPath = '/home/node/clawd/.secrets/x-rate-limit.json';
const DAILY_LIMIT = 5;

function getRateLimitState() {
  try {
    const data = JSON.parse(fs.readFileSync(rateLimitPath, 'utf8'));
    const today = new Date().toISOString().split('T')[0];
    if (data.date !== today) {
      return { date: today, count: 0, tweets: [] };
    }
    return data;
  } catch {
    return { date: new Date().toISOString().split('T')[0], count: 0, tweets: [] };
  }
}

function saveRateLimitState(state) {
  fs.writeFileSync(rateLimitPath, JSON.stringify(state, null, 2));
}

// OAuth 1.0a signing
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSignature(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  
  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams)
  ].join('&');
  
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  
  return crypto.createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
}

function generateAuthHeader(method, url, extraParams = {}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();
  
  const oauthParams = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: ACCESS_TOKEN,
    oauth_version: '1.0',
    ...extraParams
  };
  
  const signature = generateSignature(
    method,
    url,
    oauthParams,
    CONSUMER_SECRET,
    ACCESS_TOKEN_SECRET
  );
  
  oauthParams.oauth_signature = signature;
  
  const authString = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');
  
  return `OAuth ${authString}`;
}

async function postTweet(text, replyToId = null) {
  const url = 'https://api.twitter.com/2/tweets';
  
  const body = { text };
  if (replyToId) {
    body.reply = { in_reply_to_tweet_id: replyToId };
  }
  
  const authHeader = generateAuthHeader('POST', url);
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, error: parsed });
          }
        } catch (e) {
          reject({ status: res.statusCode, error: data });
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function logToMemory(tweet, tweetId, success) {
  const memoryPath = '/home/node/clawd/memory/tweets.md';
  const timestamp = new Date().toISOString();
  const status = success ? '✅' : '❌';
  
  let content = '';
  try {
    content = fs.readFileSync(memoryPath, 'utf8');
  } catch {
    content = '# Tweet Log\n\n';
  }
  
  const entry = `[${timestamp}] ${status} | ${tweetId || 'N/A'} | ${tweet.substring(0, 50)}${tweet.length > 50 ? '...' : ''}\n`;
  
  fs.writeFileSync(memoryPath, content + entry);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let text = '';
  let confirm = false;
  let replyTo = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--confirm') {
      confirm = true;
    } else if (args[i] === '--reply-to' && args[i + 1]) {
      replyTo = args[++i];
    } else if (!args[i].startsWith('--')) {
      text = args[i];
    }
  }
  
  if (!text) {
    console.error('Usage: node post.js "Tweet text" [--confirm] [--reply-to <id>]');
    process.exit(1);
  }
  
  // Check length
  if (text.length > 280) {
    console.warn(`⚠️  Tweet is ${text.length} chars (max 280). Truncating...`);
    text = text.substring(0, 277) + '...';
  }
  
  // Check rate limit
  const rateState = getRateLimitState();
  if (rateState.count >= DAILY_LIMIT) {
    console.error(`❌ Daily limit reached (${DAILY_LIMIT} tweets). Try again tomorrow.`);
    process.exit(1);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Tweet Preview');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(text);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Length: ${text.length}/280`);
  console.log(`📈 Daily usage: ${rateState.count}/${DAILY_LIMIT}`);
  if (replyTo) console.log(`↩️  Reply to: ${replyTo}`);
  console.log('');
  
  if (!confirm) {
    console.log('🔒 DRY RUN - Add --confirm to actually post');
    process.exit(0);
  }
  
  console.log('📤 Posting...');
  
  try {
    const result = await postTweet(text, replyTo);
    const tweetId = result.data?.id;
    
    console.log('✅ Posted successfully!');
    console.log(`🔗 https://twitter.com/i/status/${tweetId}`);
    
    // Update rate limit
    rateState.count++;
    rateState.tweets.push({ id: tweetId, time: new Date().toISOString(), text: text.substring(0, 50) });
    saveRateLimitState(rateState);
    
    // Log to memory
    logToMemory(text, tweetId, true);
    
  } catch (err) {
    console.error('❌ Failed to post:', err.error || err);
    logToMemory(text, null, false);
    process.exit(1);
  }
}

main();
