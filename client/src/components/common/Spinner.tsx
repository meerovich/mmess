import styles from './Spinner.module.css';

export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.spinner} style={{ width: size, height: size }} />
    </div>
  );
}
