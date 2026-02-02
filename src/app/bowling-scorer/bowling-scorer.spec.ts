import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BowlingScorer } from './bowling-scorer';

describe('BowlingScorer', () => {
  let component: BowlingScorer;
  let fixture: ComponentFixture<BowlingScorer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BowlingScorer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BowlingScorer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
