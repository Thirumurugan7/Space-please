export function FdaBanner() {
  return (
    <div className="fda-banner" role="note">
      <strong>Full Disk Access is off</strong>
      <p>
        Mail, Messages, Safari and other protected app data are skipped. Turn on Space-please under Full Disk
        Access, then rescan.
      </p>
      <button type="button" className="button primary" onClick={() => void window.sa.system.openFdaSettings()}>
        Open System Settings
      </button>
    </div>
  )
}
