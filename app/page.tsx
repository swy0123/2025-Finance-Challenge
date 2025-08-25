// app/page.tsx
// export default function HomePage() {
//   return (
//     <div style={{ padding: 20 }}>
//       <h1>Crypto Dashboard</h1>
//       <ul>
//         <li><a href="/transfer">스테이블 코인 송금/거래 시뮬레이터</a></li>
//         <li><a href="/prices">코인 시세</a></li>
//         <li><a href="/rates">환율</a></li>
//       </ul>
//     </div>
//   );
// }
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/transfer");
}
