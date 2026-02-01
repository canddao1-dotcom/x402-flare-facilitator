---
name: tweet
description: Post tweets from @cand_dao bot account. Post text, daily stats, weekly reports, with confirmation workflow. Triggers on "/tweet", "post to x", "tweet this".
---

# Tweet Skill (X/Twitter)

Post tweets from the @cand_dao bot account (FlareBank DeFi assistant).

## Quick Command

```bash
node /home/node/clawd/skills/x-post/scripts/post.js "<text>" [options]
```

## Subcommands

| Command | Description |
|---------|-------------|
| `<text>` | Draft tweet (dry-run by default) |
| `<text> --confirm` | Actually post the tweet |
| `daily` | Post daily pool stats |
| `weekly` | Post weekly performance |

## Usage Examples

```bash
# Draft a tweet (preview)
/tweet "GM Flare! 🔥"

# Actually post it
/tweet "GM Flare! 🔥" --confirm

# Reply to another tweet
/tweet "Great thread!" --reply-to 1234567890 --confirm

# Scheduled posts
/tweet daily                  # Daily pool stats
/tweet daily --confirm        # Post it
/tweet weekly                 # Weekly performance
```

## Safety Features

- **Dry-run by default** - won't post without `--confirm`
- **280 char limit** - truncates with warning
- **Rate limit tracking** - warns if approaching daily limit
- **All posts logged** to memory

## Scheduled Tweets (Cron)

| Job | Schedule | Type |
|-----|----------|------|
| Daily Pool Stats | 18:00 UTC daily | `daily-stats` |
| Position Status | Mon/Thu 12:00 UTC | `position-status` |
| Weekly Performance | Sunday 18:00 UTC | `weekly-performance` |

Run manually:
```bash
node /home/node/clawd/skills/x-post/scripts/scheduled-tweets.js --type daily-stats [--confirm]
```

## Event-Driven Tweets

The LP daemon auto-tweets when:
- Position goes **OUT OF RANGE** 🚨
- Position **NEAR EDGE** (<15%) ⚠️

Uses `tweet-alert.js` with 1-hour cooldown.

## Content Guidelines

✅ **Do:**
- DeFi analytics and pool data
- LP position updates
- On-chain observations
- Agent action summaries

❌ **Don't:**
- Financial advice
- Spam (max 5/day)
- Sensitive information

## Social Handles

| Account | Handle |
|---------|--------|
| Bot | @cand_dao |
| Protocol | @FlareBank |
| Founder | @Canddao |
| Enosys DEX | @enosys_global |
| SparkDex | @sparkdexai |

## Templates

See `TEMPLATES.md` for analytical tweet formats:
- Daily pool stats
- Position performance
- Rebalance alerts
- Volume spikes
- DEX comparisons

## API Credentials

Stored in `/home/node/clawd/.secrets/x-api.env`
**DO NOT COMMIT** - folder is gitignored
