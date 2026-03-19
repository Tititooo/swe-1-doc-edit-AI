# Testing & Deployment Guide

## Manual Testing Checklist

### Before Testing
1. Ensure mock API is enabled for local testing
2. Check that all environment variables are set (copy `.env.example` to `.env`)
3. Install dependencies: `npm install`

### Running the App Locally

```bash
npm run dev
```

This starts Vite dev server on `http://localhost:5173`

### Testing Scenarios

#### Scenario 1: Load Document (US-01) ✓
- [ ] Click "Load Document" button
- [ ] Verify spinner appears 🔄
- [ ] Verify button is disabled during load
- [ ] Verify document content loads after 2 seconds
- [ ] Verify button changes to "Loaded ✓"

#### Scenario 2: Text Editing (US-02) ✓
- [ ] Type in textarea - text should appear
- [ ] Select text with mouse
- [ ] Verify sidebar appears when text selected
- [ ] Verify sidebar disappears when text deselected

#### Scenario 3: AI Rewrite (US-03) ✓
- [ ] Select a sentence
- [ ] Click "Rewrite" button
- [ ] Verify spinner appears in button
- [ ] Wait for AI response (~3 seconds with mock)
- [ ] Verify rewritten text appears in sidebar
- [ ] Click "Apply" to replace text
- [ ] Verify text updates in textarea

#### Scenario 4: Conflict Detection (US-04) ✓
- [ ] Simulate server version change
- [ ] Select text and try to apply rewrite
- [ ] Verify yellow warning banner appears 🚩
- [ ] Verify "Apply" button is disabled
- [ ] Click dismiss (✕) on banner
- [ ] Reload document to resolve conflict

#### Scenario 5: Error Handling (US-05) ✓
- [ ] Trigger AI error
- [ ] Verify error banner appears with warning icon ⚠️
- [ ] Verify message: "AI service unavailable, please try again later."
- [ ] Wait 5 seconds - banner auto-hides
- [ ] Trigger error again and manually dismiss with ✕

---

## Deployment

### Build for Production

```bash
npm run build
```

This creates optimized bundle in `dist/` folder.

### Preview Build Locally

```bash
npm run preview
```

Serves the production build locally for testing.

---

## Known Limitations & Future Improvements

1. **Single-User Mode**: Current implementation assumes single-user editing. Multi-user real-time sync via WebSocket is planned for Phase 2.

2. **Rich-Text Editor**: Currently using basic `<textarea>`. Plan to upgrade to TipTap/ProseMirror for:
   - Formatting (bold, italic, etc.)
   - Better selection detection
   - Collaborative editing

3. **AI Service**: Mock API simulates responses. Real implementation connects to OpenAI API through backend proxy.

4. **Persistence**: No data persisted to localStorage. Consider adding for draft recovery in future.

5. **Error Recovery**: Manual retry only. Future versions should support auto-retry with exponential backoff.

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

---

## Developer Notes

### Project Structure
```
client/
├── src/
│   ├── components/      # UI components (LoadDoc, TextArea, etc.)
│   ├── hooks/           # Custom React hooks (useDocument, useAI, etc.)
│   ├── api/             # API client & mock API
│   ├── types/           # TypeScript interfaces
│   ├── styles/          # Global styles
│   ├── __tests__/       # Test utilities & checklists
│   ├── App.tsx          # Main app container
│   └── main.tsx         # Entry point
├── public/
│   └── index.html       # HTML template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

### Making Backend API Calls

When backend is ready:

1. Update `VITE_API_BASE_URL` in `.env` to point to backend URL
2. Replace mock API calls with real API calls in hooks
3. Remove `mockAPI.ts` file
4. Update error handling as needed

### ESLint & Prettier

Check code quality:
```bash
npm run lint
```

Format code:
```bash
npm run format
```

---

## Support & Troubleshooting

### Issue: "Cannot find module 'react'"
```bash
npm install
```

### Issue: Vite dev server not starting
- Clear `.vite/` cache
- Try: `rm -rf node_modules && npm install`

### Issue: TypeScript errors in IDE
- Ensure TypeScript extension installed in VS Code
- Restart TS Server: `Cmd+Shift+P` → "TypeScript: Restart TS Server"

---

## Next Steps

1. ✓ Frontend implementation complete (all 5 user stories)
2. Implement backend REST API endpoints
3. Connect to real database
4. Set up OpenAI API integration for AI service
5. Add WebSocket for real-time collaboration
6. Deploy to production
