/**
 * Testing Checklist for Frontend User Stories
 * 
 * Run through each user story's acceptance criteria
 * Use mock API for testing without backend
 */

export const testingChecklist = {
  'US-01: Loading the Document': [
    {
      criterion: 'Placeholder visible on mount',
      steps: [
        '1. Open the app',
        '2. Should see "Click Load Document to begin" message',
        '3. Textarea should show placeholder text',
      ],
      pass: false,
    },
    {
      criterion: 'Load button behavior',
      steps: [
        '1. Click "Load Document" button',
        '2. Button should be disabled immediately',
        '3. Loading spinner 🔄 should appear',
        '4. After ~2 seconds, document content should display',
        '5. Button should change to "Loaded ✓"',
      ],
      pass: false,
    },
    {
      criterion: 'Error handling on failed load',
      steps: [
        '1. Toggle mock API to fail',
        '2. Click "Load Document"',
        '3. Error banner should appear at top',
        '4. Error message should be readable',
      ],
      pass: false,
    },
  ],

  'US-02: Text Editing & Interaction': [
    {
      criterion: 'Standard text editing',
      steps: [
        '1. After loading document',
        '2. Click in textarea',
        '3. Type new text - should appear immediately',
        '4. Select text with mouse',
        '5. Selected text should highlight',
      ],
      pass: false,
    },
    {
      criterion: 'Selection triggers sidebar',
      steps: [
        '1. Click in textarea',
        '2. Select some text',
        '3. AI Sidebar should appear on right',
        '4. Deselect text (click elsewhere)',
        '5. Sidebar should disappear',
      ],
      pass: false,
    },
  ],

  'US-03: AI Assistance (Rewrite)': [
    {
      criterion: 'Rewrite request flow',
      steps: [
        '1. Load document',
        '2. Select a sentence',
        '3. Sidebar appears with selected text preview',
        '4. Click "Rewrite" button',
        '5. Button should disable and show spinner',
        '6. After ~3 seconds, rewritten text appears in sidebar',
      ],
      pass: false,
    },
    {
      criterion: 'Apply button disabled until response',
      steps: [
        '1. Select text',
        '2. "Apply" button should NOT be visible yet',
        '3. Click "Rewrite"',
        '4. Wait for response',
        '5. "Apply" button appears and is enabled',
      ],
      pass: false,
    },
    {
      criterion: 'Apply replaces selected text',
      steps: [
        '1. Select text and rewrite',
        '2. Click "Apply"',
        '3. Original text should be replaced with rewritten version',
        '4. Content should update in textarea',
      ],
      pass: false,
    },
    {
      criterion: 'Error handling on AI failure',
      steps: [
        '1. Toggle mock AI to fail',
        '2. Select text and click "Rewrite"',
        '3. Error banner appears: "unavailable, please try again"',
        '4. Loading state clears',
        '5. Can attempt again',
      ],
      pass: false,
    },
  ],

  'US-04: Conflict Prevention (Gatekeeper)': [
    {
      criterion: 'No conflict when versions match',
      steps: [
        '1. Load document (versionId=1)',
        '2. Select text and rewrite',
        '3. Click "Apply"',
        '4. No warning banner should appear',
        '5. Apply should succeed',
      ],
      pass: false,
    },
    {
      criterion: 'Conflict warning on mismatch',
      steps: [
        '1. Load document (versionId=1)',
        '2. Manually change server versionId to 2 (via mock)',
        '3. Select text and rewrite',
        '4. Click "Apply"',
        '5. Warning banner 🚩 appears: "Document has changed."',
        '6. "Apply" button stays disabled',
      ],
      pass: false,
    },
    {
      criterion: 'Banner dismiss and resolution',
      steps: [
        '1. Conflict warning visible',
        '2. Click ✕ on banner to dismiss',
        '3. Banner disappears',
        '4. User can reload document to sync',
      ],
      pass: false,
    },
  ],

  'US-05: Error Communication': [
    {
      criterion: 'AI error message display',
      steps: [
        '1. Trigger AI error (mock failure)',
        '2. Error banner appears at top',
        '3. Message: "AI service unavailable, please try again later."',
        '4. Banner includes ⚠️ icon',
      ],
      pass: false,
    },
    {
      criterion: 'Error auto-dismisses',
      steps: [
        '1. Error banner visible',
        '2. Wait 5 seconds',
        '3. Banner auto-hides',
      ],
      pass: false,
    },
    {
      criterion: 'Manual error dismiss',
      steps: [
        '1. Error banner visible',
        '2. Click ✕ button',
        '3. Banner disappears immediately',
      ],
      pass: false,
    },
    {
      criterion: 'Loading state clears after error',
      steps: [
        '1. Trigger AI error during rewrite',
        '2. Error appears',
        '3. "Rewrite" button should be enabled again',
        '4. User can attempt request again',
      ],
      pass: false,
    },
  ],

  'Integration: Full Happy Path': [
    {
      criterion: 'Complete workflow',
      steps: [
        '1. Open app → see placeholder',
        '2. Click "Load Document" → content loads',
        '3. Select text → sidebar appears',
        '4. Click "Rewrite" → AI processes (spinner)',
        '5. Rewritten text appears in sidebar',
        '6. Click "Apply" → no conflict, text updates',
        '7. Version increments',
        '8. New selection works as expected',
      ],
      pass: false,
    },
  ],
}

export default testingChecklist
