# Bridge Skill Research

## Stargate V2 on Hyperliquid
endpointID: 30150 (from docs)
- StargateOFTUSDC: 0x01A7c805cc47AbDB254CD8AaD29dE5e447F59224
- StargateOFTUSDT: 0x8619bA1B324e099CB2227060c4BC5bDEe14456c6
- StargateOFTETH: 0xBB4957E44401a31ED81Cab33539d9e8993FA13Ce
- TokenMessaging: 0x16F3F98D82d965988E6853681fD578F4d719A1c0

## Need to find:
1. Flare's LayerZero endpointID (likely 30xxx)
2. Stargate contracts on Flare
3. If FXRP is bridgeable via Stargate (native XRP wrapped)

## Known on Flare:
- USD₮0 (USDT rebrand): 0xe7cd86e13AC4309349F30B3435a9d337750fC82D
- FXRP: 0xAd552A648C74D49E10027AB8a618A3ad4901c5bE

## TODO:
- Find Stargate V2 router/OFT contracts on Flare
- Build bridge skill with quote + execute functions
- Support FXRP → Hyperliquid flow
