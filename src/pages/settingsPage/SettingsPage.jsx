import { useData } from "../../contexts/AuthContext";

function SettingsPage() {
  const { signOut } = useData();

  return (
    <div>
      <button onClick={signOut}>Logout</button>
    </div>
  );
}

export default SettingsPage;
