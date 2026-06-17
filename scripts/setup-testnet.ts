#!/usr/bin/env tsx
/**
 * Day 1 / M1.1: Setup Hedera testnet for ScoutBrief
 *
 * Reads HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY from .env (operator must be funded via faucet).
 * Creates:
 *   1. Escrow account (ED25519) funded with 50 HBAR from operator
 *   2. HCS-2 policy manifest topic
 *   3. HCS-2 audit events topic
 *
 * Prints values to append to .env. Idempotent in the sense that running again creates NEW accounts/topics
 * (doesn't reuse), so only run once per environment.
 */
import 'dotenv/config'
import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  PrivateKey,
  TopicCreateTransaction,
} from '@hashgraph/sdk'

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID
const OPERATOR_KEY_DER = process.env.HEDERA_OPERATOR_KEY
const ESCROW_INITIAL_HBAR = 50

if (!OPERATOR_ID || !OPERATOR_KEY_DER) {
  console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env')
  process.exit(1)
}

function getClient(): Client {
  const operatorKey = PrivateKey.fromStringDer(OPERATOR_KEY_DER!)
  const client = Client.forTestnet()
  client.setOperator(AccountId.fromString(OPERATOR_ID!), operatorKey)
  // Conservative defaults so we never silently overspend
  client.setDefaultMaxTransactionFee(new Hbar(2))
  client.setDefaultMaxQueryPayment(new Hbar(1))
  return client
}

async function createEscrowAccount(client: Client): Promise<{ id: string; keyDer: string }> {
  console.log('\n[1/3] Creating escrow account (ED25519)...')
  const escrowKey = PrivateKey.generateED25519()
  const tx = await new AccountCreateTransaction()
    .setKey(escrowKey.publicKey)
    .setInitialBalance(Hbar.from(ESCROW_INITIAL_HBAR, HbarUnit.Hbar))
    .setAccountMemo('ScoutBrief escrow account')
    .execute(client)
  const receipt = await tx.getReceipt(client)
  const accountId = receipt.accountId
  if (!accountId) throw new Error('Failed to get escrow accountId from receipt')
  console.log(`    ✓ Escrow account: ${accountId.toString()}`)
  console.log(`    ✓ Funded with ${ESCROW_INITIAL_HBAR} HBAR`)
  return { id: accountId.toString(), keyDer: escrowKey.toStringDer() }
}

async function createHcsTopic(client: Client, memo: string): Promise<string> {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(client.operatorPublicKey!)
    .execute(client)
  const receipt = await tx.getReceipt(client)
  const topicId = receipt.topicId
  if (!topicId) throw new Error(`Failed to get topicId from receipt for memo: ${memo}`)
  return topicId.toString()
}

async function main(): Promise<void> {
  console.log('=== ScoutBrief Testnet Setup ===')
  console.log(`Operator: ${OPERATOR_ID}`)

  const client = getClient()

  const escrow = await createEscrowAccount(client)

  console.log('\n[2/3] Creating HCS policy manifest topic...')
  const policyTopicId = await createHcsTopic(client, 'scoutbrief.policy_manifest.v1')
  console.log(`    ✓ Policy manifest topic: ${policyTopicId}`)

  console.log('\n[3/3] Creating HCS audit events topic...')
  const auditTopicId = await createHcsTopic(client, 'scoutbrief.audit_event.v1')
  console.log(`    ✓ Audit topic: ${auditTopicId}`)

  client.close()

  console.log('\n=== Append to .env (replacing existing empty lines): ===\n')
  console.log(`HEDERA_ESCROW_ID=${escrow.id}`)
  console.log(`HEDERA_ESCROW_KEY=${escrow.keyDer}`)
  console.log(`HCS_POLICY_MANIFEST_TOPIC=${policyTopicId}`)
  console.log(`HCS_AUDIT_TOPIC=${auditTopicId}`)
  console.log('\n=== HashScan links: ===')
  console.log(`Escrow:        https://hashscan.io/testnet/account/${escrow.id}`)
  console.log(`Policy topic:  https://hashscan.io/testnet/topic/${policyTopicId}`)
  console.log(`Audit topic:   https://hashscan.io/testnet/topic/${auditTopicId}`)
  console.log('\nDone. ✓')
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
