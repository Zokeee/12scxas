import dynamic from 'next/dynamic';
const NFTTool = dynamic(() => import('../components/NFTTool'), { ssr: false });

export default function Home() {
  return <NFTTool />;
}
