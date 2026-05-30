import { useData } from "../../contexts/AuthContext";

function Home() {
  const { currentUser } = useData();
  return (
    <div>
      <img src={currentUser.pfp_url} alt="" />
    </div>
  );
}

export default Home;
