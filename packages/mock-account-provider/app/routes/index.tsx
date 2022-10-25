import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import { getAccountBalances } from '../lib/balances.server'

type LoaderData = {
  // this is a handy way to say: "posts is whatever type getPosts resolves to"
  accountBalances: Awaited<ReturnType<typeof getAccountBalances>>;
};

export const loader = async () => {
  return json<LoaderData>({
    accountBalances: await getAccountBalances(),
  });
};

export default function Posts() {
  const { accountBalances } = useLoaderData() as LoaderData
  return (
    <main>
      <h1>Balances</h1>
      <ul>
        {accountBalances.map((accBal) => (
          <li key={accBal.paymentPointer}>
            {accBal.paymentPointer}: {accBal.balance}
          </li>
        ))}
      </ul>
    </main>
  )
}