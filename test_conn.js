async function main() {
  console.log('Testing connectivity to http://127.0.0.1:3001/graphql...');
  try {
    const response = await fetch('http://127.0.0.1:3001/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' })
    });
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Data:', JSON.stringify(data));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
main();
