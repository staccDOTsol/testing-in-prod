const HOMECOMING_IDS = ["6312", "6980", "6982", "6983", "7118"];

const BURN_FEED = [
  {
    status: "deployed",
    id: "#6982",
    repo: "staccDOTsol/testing-in-prod",
    wallet: "0x26E8…5158",
    time: "just now",
    prompt:
      "the domain for this thing is app.burnpr.fun, so let's rebrand entirely around this — a proof of concept for burnpr.fun, burnpr",
  },
  {
    status: "deployed",
    id: "#6981",
    repo: "staccDOTsol/testing-in-prod",
    wallet: "0x26E8…5158",
    time: "49m ago",
    prompt: "make the landing page much more beautiful; redesign, publish, do it.",
  },
  {
    status: "deployed",
    id: "#6309",
    repo: "staccDOTsol/testing-in-prod",
    wallet: "0x26E8…5158",
    time: "1h ago",
    prompt:
      "create an saas boilerplate app, it should focus on being an ez interface to have an onchain conversation using ens name discovery and ethereum message signing.",
  },
];

function renderFeed() {
  const list = document.getElementById("feedList");
  list.innerHTML = BURN_FEED.map(
    (item) => `
    <li class="feed-item">
      <div class="feed-item-top">
        <span>${item.id} · ${item.wallet} · ${item.time}</span>
        <span class="feed-status">${item.status}</span>
      </div>
      <div class="feed-repo">${item.repo}</div>
      <div class="feed-prompt">${item.prompt}</div>
    </li>`
  ).join("");
}

function renderChips() {
  const chips = document.getElementById("nftChips");
  chips.innerHTML = HOMECOMING_IDS.map(
    (id, i) => `<button type="button" class="chip${i === 2 ? " selected" : ""}" data-id="${id}">${id}</button>`
  ).join("");
  chips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      updateBurnButton();
    });
  });
}

let walletConnected = false;

function updateBurnButton() {
  const burnBtn = document.getElementById("burnBtn");
  const promptLen = document.getElementById("promptInput").value.trim().length;
  burnBtn.disabled = !(walletConnected && promptLen > 0);
}

function showModal(text) {
  const modal = document.getElementById("modal");
  document.getElementById("modalText").textContent = text;
  modal.hidden = false;
}

async function connectWallet() {
  const status = document.getElementById("walletStatus");
  const btn = document.getElementById("connectBtn");

  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accounts[0];
      status.textContent = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
      walletConnected = true;
      btn.textContent = "connected";
      document.getElementById("nftRow").hidden = false;
      updateBurnButton();
      return;
    } catch (err) {
      showModal("Wallet connection was rejected.");
      return;
    }
  }

  status.textContent = "0x26e8…5158 (demo)";
  walletConnected = true;
  btn.textContent = "connected";
  document.getElementById("nftRow").hidden = false;
  updateBurnButton();
}

function init() {
  renderFeed();
  renderChips();

  document.getElementById("connectBtn").addEventListener("click", connectWallet);

  const promptInput = document.getElementById("promptInput");
  const charCount = document.getElementById("charCount");
  promptInput.addEventListener("input", () => {
    charCount.textContent = String(promptInput.value.length);
    updateBurnButton();
  });

  document.getElementById("burnBtn").addEventListener("click", () => {
    showModal(
      "This proof-of-concept doesn't burn a real NFT. On app.burnpr.fun, this action burns your Homecoming NFT on Robinhood Chain and queues an agent to ship your prompt."
    );
  });

  document.getElementById("modalClose").addEventListener("click", () => {
    document.getElementById("modal").hidden = true;
  });
}

document.addEventListener("DOMContentLoaded", init);
