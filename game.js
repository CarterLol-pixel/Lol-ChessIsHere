document.querySelectorAll(".square").forEach(square => {
  square.addEventListener("click", () => {
    square.classList.toggle("selected");
  });
});
