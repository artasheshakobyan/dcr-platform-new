import SharePage from './SharePage'
export default function Page({ params }: { params: { token: string } }) {
  return <SharePage token={params.token} />
}
