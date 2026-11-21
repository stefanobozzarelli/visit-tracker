/**
 * Opens a file whose link must first be fetched from the server (attachments
 * are only handed out to signed-in users). The new tab is opened right away,
 * inside the click, so browsers do not block it as a pop-up; it is pointed at
 * the file once the link arrives.
 */
export async function openSignedLink(getUrl: () => Promise<string | undefined>): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const url = await getUrl();
    if (!url) throw new Error('No link returned');
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (err) {
    if (win) win.close();
    alert('Impossibile aprire il file. Riprova.');
  }
}
