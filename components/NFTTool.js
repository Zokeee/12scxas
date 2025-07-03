"use client";

import React, { useState } from "react";
import { Connection, clusterApiUrl, PublicKey, Keypair } from "@solana/web3.js";
import { Metaplex, keypairIdentity, bundlrStorage } from "@metaplex-foundation/js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import JSZip from "jszip";
import Papa from "papaparse";

export default function NFTTool() {
  const [log, setLog] = useState([]);
  const [network, setNetwork] = useState("devnet");
  const [cliKeypair, setCliKeypair] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [mintCount, setMintCount] = useState(1);

  const wallet = useWallet();
  const connection = new Connection(clusterApiUrl(network));
  const identity = cliKeypair ? keypairIdentity(cliKeypair) : undefined;

  const metaplex = Metaplex.make(connection)
    .use(identity || keypairIdentity(Keypair.generate()))
    .use(
      bundlrStorage({
        address: "https://devnet.bundlr.network",
        providerUrl: clusterApiUrl(network),
        timeout: 60000,
      })
    );

  const handleZip = async (file) => {
    const zip = await JSZip.loadAsync(file);
    const metadataFiles = Object.keys(zip.files).filter((name) => name.endsWith(".json"));

    for (let name of metadataFiles) {
      const metaText = await zip.files[name].async("string");
      const metadata = JSON.parse(metaText);

      const { uri } = await metaplex.nfts().uploadMetadata(metadata);

      for (let i = 0; i < mintCount; i++) {
        const { nft } = await metaplex.nfts().create({
          uri,
          name: metadata.name,
          sellerFeeBasisPoints: metadata.seller_fee_basis_points || 500,
          symbol: metadata.symbol || "",
          updateAuthority: cliKeypair?.publicKey || wallet.publicKey,
        });

        setLog((log) => [
          ...log,
          { name: metadata.name, mint: nft.address.toBase58(), status: "minted" },
        ]);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file.name.endsWith(".zip")) handleZip(file);
    if (file.name.endsWith(".csv")) handleCSVRecipients(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleCSVRecipients = async (file) => {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: false });
    const addresses = parsed.data.flat().filter((a) => a.length > 30);
    setRecipients(addresses);
  };

  const handleKeypairUpload = async (e) => {
    const file = e.target.files[0];
    const text = await file.text();
    const secret = Uint8Array.from(JSON.parse(text));
    const keypair = Keypair.fromSecretKey(secret);
    setCliKeypair(keypair);
  };

  const handleSend = async () => {
    for (let entry of log) {
      if (entry.status !== "minted") continue;
      const mintAddress = new PublicKey(entry.mint);

      for (let to of recipients) {
        try {
          const tx = await metaplex.nfts().send({
            mintAddress,
            toOwner: new PublicKey(to),
          });
          setLog((log) => [
            ...log,
            {
              mint: mintAddress.toBase58(),
              to,
              tx: tx.response.signature,
              status: "sent",
            },
          ]);
        } catch (err) {
          setLog((log) => [
            ...log,
            {
              mint: mintAddress.toBase58(),
              to,
              status: "error",
              error: err.message,
            },
          ]);
        }
      }
    }
  };

  const handleCSVDownload = () => {
    const csv = Papa.unparse(log);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nft-log.csv";
    a.click();
  };

  return (
    <div
      className="p-6 max-w-3xl mx-auto"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <h1 className="text-3xl font-bold mb-4">Solana NFT Tool</h1>

      <WalletMultiButton className="mb-4" />

      <div className="mb-4">
        <label className="mr-2">Сеть:</label>
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          className="p-1 border rounded"
        >
          <option value="devnet">Devnet</option>
          <option value="mainnet-beta">Mainnet</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block">Сколько копий каждого NFT минтить:</label>
        <input
          type="number"
          value={mintCount}
          onChange={(e) => setMintCount(parseInt(e.target.value))}
          className="p-1 border rounded w-16"
        />
      </div>

      <div className="mb-4">
        <label className="block">Загрузить keypair.json (CLI):</label>
        <input type="file" accept=".json" onChange={handleKeypairUpload} />
      </div>

      <div className="mb-4">
        <label className="block">Или перетащите .zip или .csv сюда</label>
        <div className="border-dashed border-2 p-4 rounded bg-gray-50 text-center text-sm text-gray-600">
          Drag & Drop .zip/.csv here
        </div>
      </div>

      <div className="mb-4">
        <label className="block">
          Список получателей (через запятую или с новой строки):
        </label>
        <textarea
          rows={3}
          className="w-full border rounded p-2"
          onChange={(e) =>
            setRecipients(e.target.value.split(/,|\n/).map((a) => a.trim()))
          }
        ></textarea>
        <button
          onClick={handleSend}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Разослать NFT
        </button>
      </div>

      <div className="mb-4">
        <button
          onClick={handleCSVDownload}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          Скачать лог как CSV
        </button>
      </div>

      <h2 className="text-xl font-semibold mb-2">Лог</h2>
      <pre className="bg-gray-100 p-4 rounded-xl text-sm overflow-auto h-64">
        {JSON.stringify(log, null, 2)}
      </pre>
    </div>
  );
}
