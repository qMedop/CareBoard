import styles from "./Loading.module.css";
function Loading({ size = 32, transparent = false, onlyIcon = false }) {
  return (
    <div
      style={transparent ? { backgroundColor: "transparent" } : {}}
      className={`${styles.loadingContainer} ${
        onlyIcon ? styles.onlyIcon : ""
      }`}
    >
      <div style={{ width: size, height: size }} className={styles.loadingAnim}>
        <div className={styles.cube}></div>
      </div>
    </div>
  );
}

export default Loading;
