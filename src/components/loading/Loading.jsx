import styles from "./Loading.module.css";
function Loading({ size = 70, transparent = false, onlyIcon = false }) {
  return (
    <div
      style={{
        backgroundColor: `${transparent ? "transparent" : null}`,
        "--size": `${size}px`,
      }}
      className={`${styles.loadingContainer} ${
        onlyIcon ? styles.onlyIcon : ""
      }`}
    >
      <div className={styles.loadingAnim}>
        <div className={styles.cube}></div>
      </div>
    </div>
  );
}

export default Loading;
