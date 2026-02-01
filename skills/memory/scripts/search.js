#!/usr/bin/env node
/**
 * Memory Search - Find past events
 * 
 * Usage:
 *   node search.js --query "SWAP BANK"
 *   node search.js --query "0x1234" --type TX
 *   node search.js --days 7 --type ERROR
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = '/home/node/clawd/memory';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : null;
  };
  return {
    query: get('--query') || get('-q'),
    type: get('--type'),
    days: parseInt(get('--days') || '30'),
    limit: parseInt(get('--limit') || '50'),
  };
}

function getRecentFiles(days) {
  const files = [];
  const now = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);
    
    if (fs.existsSync(filePath)) {
      files.push({ path: filePath, date: dateStr });
    }
  }
  
  // Also include specialized files
  const specialFiles = ['transactions.md', 'decisions.md', 'errors.md'];
  for (const file of specialFiles) {
    const filePath = path.join(MEMORY_DIR, file);
    if (fs.existsSync(filePath)) {
      files.push({ path: filePath, date: file });
    }
  }
  
  return files;
}

function searchInFile(filePath, query, typeFilter) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const results = [];
  
  const queryLower = query ? query.toLowerCase() : null;
  const typeUpper = typeFilter ? typeFilter.toUpperCase() : null;
  
  for (const line of lines) {
    // Skip empty lines and headers
    if (!line.trim() || line.startsWith('#')) continue;
    
    // Apply type filter
    if (typeUpper && !line.includes(`[${typeUpper}]`)) continue;
    
    // Apply query filter
    if (queryLower && !line.toLowerCase().includes(queryLower)) continue;
    
    results.push(line);
  }
  
  return results;
}

function main() {
  const args = parseArgs();
  
  if (!args.query && !args.type) {
    console.error('Usage: node search.js --query "search term" [--type TX|DECISION|ERROR] [--days 30]');
    process.exit(1);
  }
  
  const files = getRecentFiles(args.days);
  
  if (files.length === 0) {
    console.log('No memory files found.');
    return;
  }
  
  const allResults = [];
  
  for (const file of files) {
    const results = searchInFile(file.path, args.query, args.type);
    for (const result of results) {
      allResults.push({ source: file.date, entry: result });
    }
  }
  
  if (allResults.length === 0) {
    console.log('No matching entries found.');
    return;
  }
  
  console.log(`Found ${allResults.length} matching entries:\n`);
  
  // Show most recent first, up to limit
  const toShow = allResults.slice(0, args.limit);
  
  for (const result of toShow) {
    console.log(`[${result.source}] ${result.entry}`);
  }
  
  if (allResults.length > args.limit) {
    console.log(`\n... and ${allResults.length - args.limit} more (use --limit to see more)`);
  }
}

main();
