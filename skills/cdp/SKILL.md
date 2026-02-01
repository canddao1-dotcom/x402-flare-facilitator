---
name: cdp
description: Enosys Loans (CDP) protocol. Check stability pool deposits, deposit/withdraw CDP, view collateral rewards. Triggers on "/cdp", "enosys loans", "stability pool", "cdp earn", "liquity".
---

# CDP Skill (Enosys Loans)

Interact with Enosys Loans protocol - a Liquity V2 fork on Flare.

## Quick Command

```bash
node /home/node/clawd/skills/cdp/scripts/cdp.js <command> [options]
```

## Subcommands

| Command | Description |
|---------|-------------|
| `status` | Protocol stats, pool TVL, your positions |
| `balance [address]` | Check CDP balance and SP deposits |
| `deposit <amount> <pool>` | Deposit CDP to earn pool (fxrp/wflr) |
| `withdraw <amount> <pool>` | Withdraw from earn pool |
| `claim <pool>` | Claim yield + liquidation collateral |
| `pools` | Show stability pool stats |

## Usage Examples

```bash
# Check protocol status
/cdp status

# Check your position
/cdp balance

# Deposit 100 CDP to FXRP earn pool
/cdp deposit 100 fxrp

# Withdraw 50 CDP from WFLR pool
/cdp withdraw 50 wflr

# Claim all rewards from FXRP pool
/cdp claim fxrp
```

## Contract Addresses

### CDP Token
| Contract | Address |
|----------|---------|
| CDP Dollar | `0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F` |

### FXRP Branch
| Contract | Address |
|----------|---------|
| BorrowerOperations | `0x18139E09Fb9a683Dd2c2df5D0edAD942c19CE912` |
| TroveManager | `0xc46e7d0538494FEb82b460b9723dAba0508C8Fb1` |
| StabilityPool | `0x2c817F7159c08d94f09764086330c96Bb3265A2f` |
| PriceFeed | `0xFc35d431Ce1445B9c79ff38594EF454618D2Ec49` |

### WFLR Branch
| Contract | Address |
|----------|---------|
| BorrowerOperations | `0x19b154D5d20126a77309ae01931645a135E4E252` |
| TroveManager | `0xB6cB0c5301D4E6e227Ba490cee7b92EB954ac06D` |
| StabilityPool | `0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A` |

## Protocol Parameters
- MCR (Min Collateral Ratio): 110%
- CCR (Critical Collateral Ratio): 150%
- CDP Decimals: 18

## Stability Pool Interface

```solidity
// Deposit CDP to earn
function provideToSP(uint256 _topUp, bool _doClaim)

// Withdraw CDP
function withdrawFromSP(uint256 _amount, bool _doClaim)

// View functions
function getCompoundedBoldDeposit(address) → current deposit
function getDepositorYieldGain(address) → pending CDP yield
function getDepositorCollGain(address) → pending collateral
```

## Rewards
- **Yield**: CDP interest from borrowers
- **Collateral**: Liquidated collateral (FXRP or WFLR) at discount
