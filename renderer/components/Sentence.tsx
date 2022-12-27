export const Sentence = ({origin, separation}) => {
  const handleChange = (origin) => {
    console.log(origin)
  }
  return <button  className={"subtitle"}  onClick={() => {
    handleChange(origin)
  }}>
    {separation.map((val, index) => {
      return <ruby key={index}>{val.bottom}
        <rp>(</rp>
        <rt>{val.top ?? ''}</rt>
        <rp>)</rp>
      </ruby>
    })}
  </button>
}

export default Sentence;