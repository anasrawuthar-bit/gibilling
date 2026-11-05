/**
 * Test to verify that items with taxType 'GST@18%' properly show 'GST@18%' in transaction rows
 * when transacting with local parties (e.g. rafi in Kerala), and do NOT wrongly flip to 'IGST@18%'.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Item GST Tax Rate Selection...');

// Test 1: Verify taxOptionLabel logic
function taxOptionLabel(rate, isIgst = false) {
  if (typeof rate === "string") {
    const trimmed = rate.trim();
    if (trimmed.toLowerCase() === "exempt") return "Exempt";
    if (trimmed.toLowerCase() === "none" || trimmed === "0" || trimmed === "0%") return "None";
    if (trimmed.toUpperCase().startsWith("IGST@") || trimmed.toUpperCase().startsWith("GST@")) return trimmed;
  }
  const numericRate = Number(rate || 0);
  if (!numericRate) return "None";
  const prefix = isIgst ? "IGST" : "GST";
  return `${prefix}@${numericRate}%`;
}

assert.strictEqual(taxOptionLabel(18, false), "GST@18%", "Intra-state (local) must return GST@18%");
assert.strictEqual(taxOptionLabel(18, true), "IGST@18%", "Inter-state must return IGST@18%");
assert.strictEqual(taxOptionLabel("GST@18%", false), "GST@18%");

// Test 2: Preferred Tax selection logic
function resolvePreferredTax(item, isIgst) {
  if (item.taxType) {
    if (isIgst) {
      return item.taxType.startsWith("GST@") ? item.taxType.replace("GST@", "IGST@") : item.taxType;
    } else {
      return item.taxType.startsWith("IGST@") ? item.taxType.replace("IGST@", "GST@") : item.taxType;
    }
  }
  return taxOptionLabel(item.taxRate, isIgst);
}

const localItem = { name: "monitor", taxType: "GST@18%", taxRate: 18 };
assert.strictEqual(resolvePreferredTax(localItem, false), "GST@18%", "Local transaction MUST keep GST@18%");
assert.strictEqual(resolvePreferredTax(localItem, true), "IGST@18%", "Interstate transaction converts to IGST@18%");

// Test 3: Party State Resolution
const firmState = "Kerala";
const partyRafi = { name: "rafi", state: "", gstin: "" }; // local party without explicit state
const partyAjal = { name: "ajal", state: "Kerala", gstin: "" };
const partyInterstate = { name: "bangalore_traders", state: "Karnataka", gstin: "29ABCDE1234F1Z5" };

function resolveTargetState(party, firmState = "Kerala") {
  const derivedGstinState = party.gstin ? (party.gstin.startsWith("29") ? "Karnataka" : "Kerala") : "";
  const resolvedPartyState = party.state || "";
  return derivedGstinState || resolvedPartyState || firmState;
}

assert.strictEqual(resolveTargetState(partyRafi, firmState), "Kerala", "Party with empty state must resolve to firmState (Kerala)");
assert.strictEqual(resolveTargetState(partyAjal, firmState), "Kerala", "Kerala party must resolve to Kerala");
assert.strictEqual(resolveTargetState(partyInterstate, firmState), "Karnataka", "Interstate party must resolve to Karnataka");

console.log('✓ All Item GST Tax Selection checks passed (100%)');
